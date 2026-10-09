import { getSettings, listBookings, putBooking, addLog, hasStore } from '@/lib/store';
import { notify, adminRecipients } from '@/lib/booking';
import { sendMail, digestMail, mailReady } from '@/lib/mail';
import { appUrl } from '@/lib/google';
import { localParts, addDays, zonedToUtc, fmtDateShort } from '@/lib/time';
import { json } from '@/lib/auth';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// 매일 아침(Vercel Cron): 내일 심방이 있는 신청자에게 안내 메일 + 목회자에게 내일 일정 요약
export async function GET(req) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) return json({ error: 'unauthorized' }, 401);
  if (!hasStore || !mailReady()) return json({ ok: false, reason: 'setup' });
  const base = appUrl(req);
  const settings = await getSettings();
  const tomorrow = addDays(localParts(Date.now()).date, 1);
  const list = (await listBookings(zonedToUtc(tomorrow, '00:00'), zonedToUtc(addDays(tomorrow, 1), '00:00') - 1)).filter((b) => b.status === 'confirmed');
  let reminded = 0;
  for (const b of list) {
    if (b.reminded || !b.email) continue;
    await notify(b.id, { applicant: 'reminder', appUrl: base });
    const { getBooking } = await import('@/lib/store');
    const cur = await getBooking(b.id);
    if (cur) await putBooking({ ...cur, reminded: true });
    reminded++;
  }
  if (list.length) {
    for (const to of adminRecipients(settings)) {
      try { await sendMail({ to, ...digestMail(list, { settings, appUrl: base, dateLabel: fmtDateShort(tomorrow) }) }); }
      catch (e) { await addLog('mail', '내일 일정 요약 메일 실패: ' + e.message); }
    }
  }
  return json({ ok: true, tomorrow, bookings: list.length, reminded });
}
