import { guardAdmin, json, adminEmails } from '@/lib/auth';
import { getSettings, saveSettings, getLog } from '@/lib/store';
import { connectionInfo, appUrl } from '@/lib/google';
import { mailReady } from '@/lib/mail';

export const dynamic = 'force-dynamic';

async function state(req, session) {
  return {
    settings: await getSettings(),
    calendar: await connectionInfo(),
    mail: { ready: mailReady(), from: mailReady() ? process.env.GMAIL_USER : '' },
    env: { adminEmails: adminEmails(), appUrl: appUrl(req), passwordLogin: Boolean(process.env.ADMIN_PASSWORD), sessionSecret: Boolean(process.env.SESSION_SECRET), cron: Boolean(process.env.CRON_SECRET) },
    me: session.who,
    log: await getLog(),
  };
}

export async function GET(req) {
  const g = await guardAdmin(req); if (g.error) return g.error;
  return json(await state(req, g.session));
}

export async function POST(req) {
  const g = await guardAdmin(req); if (g.error) return g.error;
  const { settings } = await req.json().catch(() => ({}));
  if (!settings || typeof settings !== 'object') return json({ error: '설정 값이 없습니다.' }, 400);
  await saveSettings({ ...(await getSettings()), ...settings });
  return json(await state(req, g.session));
}
