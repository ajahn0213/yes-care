import { after } from 'next/server';
import { availability, reschedule, cancel, notify, publicView, BookingError } from '@/lib/booking';
import { hasStore, rateLimit, bookingByToken, getSettings } from '@/lib/store';
import { appUrl } from '@/lib/google';
import { isIsoStart } from '@/lib/validate';
import { localParts, addDays } from '@/lib/time';
import { clientIp, sameOrigin, json, fail } from '@/lib/auth';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// 예약 관리 링크(토큰)로만 자기 예약을 보고 바꿀 수 있음. 토큰은 URL 쿼리가 아니라 본문으로 받음.
export async function POST(req) {
  if (!hasStore) return fail('앱 설정을 마무리하고 있어요.', 503);
  if (!sameOrigin(req)) return fail('잘못된 요청입니다.', 403);
  if (!(await rateLimit('manage', clientIp(req), 40, 600))) return fail('잠시 후 다시 시도해 주세요.', 429);
  const body = await req.json().catch(() => ({}));
  const b = await bookingByToken(body.token);
  if (!b) return fail('예약을 찾을 수 없어요. 메일에 있는 링크를 그대로 열어 주세요.', 404);
  const settings = await getSettings();
  const base = appUrl(req);
  try {
    if (body.action === 'view') {
      return json({ booking: publicView(b, settings), canChange: b.status === 'confirmed' && Date.parse(b.start) > Date.now(), minNoticeHours: settings.minNoticeHours });
    }
    if (body.action === 'slots') {
      if (b.status !== 'confirmed') return fail('변경할 수 없는 예약이에요.', 409);
      const today = localParts(Date.now()).date;
      const r = await availability({ from: today, to: addDays(today, settings.horizonDays), exclude: b });
      if (!r.ready) return json({ ready: false, message: r.message });
      return json({ ready: true, days: Object.fromEntries(Object.entries(r.days).map(([k, v]) => [k, v.map((x) => ({ start: x.start, time: x.time }))])) });
    }
    if (body.action === 'cancel') {
      if (Date.parse(b.start) < Date.now()) return fail('이미 지난 일정은 취소할 수 없어요.', 409);
      const { booking, already } = await cancel(b.id, { by: 'applicant', reason: String(body.reason || '').slice(0, 200) });
      if (!already) after(() => notify(b.id, { applicant: 'cancelled', admin: 'cancelled', appUrl: base, extra: booking.cancelReason ? '취소 사유: ' + booking.cancelReason : '' }));
      return json({ ok: true, booking: publicView(booking, settings) });
    }
    if (body.action === 'reschedule') {
      if (!isIsoStart(body.start)) return fail('시간을 다시 골라 주세요.');
      const { booking } = await reschedule(b.id, body.start, { by: 'applicant', appUrl: base });
      after(() => notify(b.id, { applicant: 'rescheduled', admin: 'rescheduled', appUrl: base }));
      return json({ ok: true, booking: publicView(booking, settings) });
    }
    return fail('알 수 없는 요청입니다.');
  } catch (e) {
    if (e instanceof BookingError) return fail(e.message, e.status, { code: e.code });
    return fail('처리하지 못했어요. 잠시 후 다시 시도해 주세요.', 503);
  }
}
