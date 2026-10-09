import { guardAdmin, json, fail } from '@/lib/auth';
import { checkSync, fixSync, BookingError } from '@/lib/booking';
import { getGoogle, setGoogle, getBooking } from '@/lib/store';
import { appUrl, freeBusy, CalendarError } from '@/lib/google';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(req) {
  const g = await guardAdmin(req); if (g.error) return g.error;
  const body = await req.json().catch(() => ({}));
  try {
    if (body.action === 'test') {
      const now = new Date();
      const busy = await freeBusy(now.toISOString(), new Date(now.getTime() + 7 * 864e5).toISOString());
      return json({ ok: true, message: `연결 정상 · 앞으로 7일 동안 바쁜 시간 ${busy.length}개를 확인했습니다.` });
    }
    if (body.action === 'check') return json(await checkSync());
    if (body.action === 'fix') {
      const { booking } = await fixSync(body.id, body.fix, { appUrl: appUrl(req) });
      return json({ booking });
    }
    if (body.action === 'calendarId') {
      const cur = await getGoogle();
      if (!cur) return fail('먼저 캘린더를 연결해 주세요.');
      const id = String(body.calendarId || 'primary').trim().slice(0, 200) || 'primary';
      await setGoogle({ ...cur, calendarId: id });
      return json({ ok: true });
    }
    if (body.action === 'disconnect') {
      await setGoogle(null);
      return json({ ok: true });
    }
    return fail('알 수 없는 작업입니다.');
  } catch (e) {
    if (e instanceof BookingError || e instanceof CalendarError) return fail(e.message, e.status || 502);
    return fail(e.message || '처리하지 못했습니다.', 500);
  }
}
