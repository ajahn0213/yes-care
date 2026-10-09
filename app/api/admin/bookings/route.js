import { after } from 'next/server';
import { guardAdmin, json, fail } from '@/lib/auth';
import { listBookings, getBooking, getNotes, deleteBooking, getSettings } from '@/lib/store';
import { adminCreate, reschedule, cancel, setStatus, adminUpdate, notify, BookingError } from '@/lib/booking';
import { deleteEvent } from '@/lib/google';
import { appUrl } from '@/lib/google';
import { cleanApplicant, isIsoStart } from '@/lib/validate';
import { zonedToUtc, addDays } from '@/lib/time';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const strip = ({ tokenEnc, tokenHash, ...b }) => b;
const flagsOf = (n) => (n ? { followUp: !!n.followUp, nextVisit: n.nextVisit || '', hasMemo: !!(n.memo || '').trim() } : null);
const D = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(req) {
  const g = await guardAdmin(req); if (g.error) return g.error;
  const q = new URL(req.url).searchParams;
  if (q.get('id')) {
    const b = await getBooking(q.get('id'));
    if (!b) return fail('예약을 찾을 수 없습니다.', 404);
    const notes = await getNotes([b.id]);
    return json({ booking: strip(b), flags: flagsOf(notes[b.id]) });
  }
  const from = D.test(q.get('from') || '') ? q.get('from') : '2000-01-01';
  const to = D.test(q.get('to') || '') ? q.get('to') : '2100-01-01';
  const list = await listBookings(zonedToUtc(from, '00:00'), zonedToUtc(addDays(to, 1), '00:00') - 1);
  const notes = await getNotes(list.map((b) => b.id));
  return json({ bookings: list.map(strip), flags: Object.fromEntries(Object.entries(notes).map(([k, n]) => [k, flagsOf(n)])) });
}

export async function POST(req) {
  const g = await guardAdmin(req); if (g.error) return g.error;
  const body = await req.json().catch(() => ({}));
  const base = appUrl(req);
  const startOf = () => (isIsoStart(body.start) ? body.start : D.test(body.date || '') && /^\d{2}:\d{2}$/.test(body.time || '') ? new Date(zonedToUtc(body.date, body.time)).toISOString() : null);
  try {
    switch (body.action) {
      case 'create': {
        const start = startOf();
        if (!start) return fail('날짜와 시간을 정해 주세요.');
        const input = { ...body.input, email: body.input?.email || 'none@invalid.local' };
        const { value, errors } = cleanApplicant(input);
        delete errors.email;
        if (Object.keys(errors).length) return fail(Object.values(errors)[0]);
        if (value.email === 'none@invalid.local') value.email = '';
        const { booking } = await adminCreate(value, start, { appUrl: base, force: !!body.force, sendMailToApplicant: !!body.sendMail });
        after(() => notify(booking.id, { applicant: booking.sendApplicantMail ? 'confirmed' : null, admin: null, appUrl: base }));
        return json({ booking: strip(booking) });
      }
      case 'reschedule': {
        const start = startOf();
        if (!start) return fail('새 날짜와 시간을 정해 주세요.');
        const { booking } = await reschedule(body.id, start, { by: 'admin', appUrl: base, force: !!body.force });
        if (body.notify) after(() => notify(booking.id, { applicant: 'rescheduled', appUrl: base }));
        return json({ booking: strip(booking) });
      }
      case 'cancel': {
        const { booking, already } = await cancel(body.id, { by: 'admin', reason: body.reason });
        if (!already && body.notify) after(() => notify(booking.id, { applicant: 'cancelled', appUrl: base }));
        return json({ booking: strip(booking) });
      }
      case 'status': return json({ booking: strip((await setStatus(body.id, body.status)).booking) });
      case 'update': {
        const cur = await getBooking(body.id);
        if (!cur) return fail('예약을 찾을 수 없습니다.', 404);
        const { value, errors } = cleanApplicant({ ...cur, ...body.patch, email: body.patch?.email ?? cur.email ?? '' });
        if (!value.email) delete errors.email;
        if (Object.keys(errors).length) return fail(Object.values(errors)[0]);
        return json({ booking: strip((await adminUpdate(body.id, value, { appUrl: base })).booking) });
      }
      case 'resend': {
        const b = await getBooking(body.id);
        if (!b?.email) return fail('신청자 이메일이 없습니다.');
        if (b.status !== 'confirmed') return fail('예약 확정 상태에서만 다시 보낼 수 있습니다.');
        await notify(b.id, { applicant: 'confirmed', appUrl: base });
        const after2 = await getBooking(b.id);
        const last = (after2.mail || []).slice(-1)[0];
        if (!last?.ok) return fail('메일을 보내지 못했습니다: ' + (last?.error || ''), 502, { booking: strip(after2) });
        return json({ booking: strip(after2) });
      }
      case 'delete': {
        const b = await getBooking(body.id);
        if (!b) return fail('예약을 찾을 수 없습니다.', 404);
        if (b.status === 'confirmed' && Date.parse(b.end) > Date.now()) return fail('예정된 심방은 먼저 취소한 뒤 삭제해 주세요.');
        if (b.calendar?.eventId && b.status === 'confirmed') { try { await deleteEvent(b.calendar.eventId, { notify: false }); } catch {} }
        await deleteBooking(b);
        return json({ ok: true });
      }
      default: return fail('알 수 없는 작업입니다.');
    }
  } catch (e) {
    if (e instanceof BookingError) return fail(e.message, e.status, { code: e.code });
    return fail(e.message || '처리하지 못했습니다.', 500);
  }
}
