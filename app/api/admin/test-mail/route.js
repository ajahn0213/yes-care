import { guardAdmin, json, fail } from '@/lib/auth';
import { sendMail, testMail, mailReady } from '@/lib/mail';
import { appUrl } from '@/lib/google';
import { getSettings } from '@/lib/store';
import { adminRecipients } from '@/lib/booking';

export const dynamic = 'force-dynamic';

export async function POST(req) {
  const g = await guardAdmin(req); if (g.error) return g.error;
  if (!mailReady()) return fail('메일 설정(GMAIL_USER, GMAIL_APP_PASSWORD)이 아직 없습니다.');
  const to = adminRecipients(await getSettings());
  if (!to.length) return fail('알림 받을 이메일이 없습니다.');
  try { for (const t of to) await sendMail({ to: t, ...testMail({ appUrl: appUrl(req) }) }); }
  catch (e) { return fail(e.message, 502); }
  return json({ ok: true, to });
}
