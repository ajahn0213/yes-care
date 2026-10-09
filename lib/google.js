// Google 로그인 + Google Calendar API (공식 REST API만 사용) — 서버 전용
// 필요한 권한: calendar.events (심방 일정 만들기·바꾸기·지우기), calendar.freebusy (바쁜 시간만 확인 — 일정 내용은 읽지 않음)
import { getGoogle, setGoogle, addLog } from './store';
import { encrypt, decrypt } from './secure';

const OAUTH = process.env.GOOGLE_OAUTH_BASE || 'https://accounts.google.com';
const TOKEN_URL = process.env.GOOGLE_TOKEN_URL || 'https://oauth2.googleapis.com/token';
const API = process.env.GOOGLE_API_BASE || 'https://www.googleapis.com';

export const CAL_SCOPES = ['https://www.googleapis.com/auth/calendar.events', 'https://www.googleapis.com/auth/calendar.freebusy'];
export const googleConfigured = () => Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);

export class CalendarError extends Error {
  constructor(message, code) { super(message); this.code = code; } // code: 'not_connected' | 'expired' | 'network' | 'api'
}

export function appUrl(req) {
  const env = (process.env.APP_URL || '').replace(/\/+$/, '');
  if (env) return env;
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return 'https://' + process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (req) { const u = new URL(req.url); return u.origin; }
  return 'http://localhost:3000';
}

export function authUrl({ state, mode, redirectUri, loginHint }) {
  const scopes = ['openid', 'email', ...(mode === 'connect' ? CAL_SCOPES : [])];
  const q = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID, redirect_uri: redirectUri, response_type: 'code',
    scope: scopes.join(' '), state, include_granted_scopes: 'true',
    ...(mode === 'connect' ? { access_type: 'offline', prompt: 'consent' } : { prompt: 'select_account' }),
    ...(loginHint ? { login_hint: loginHint } : {}),
  });
  return `${OAUTH}/o/oauth2/v2/auth?${q}`;
}

export async function exchangeCode(code, redirectUri) {
  const r = await fetch(TOKEN_URL, {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ code, client_id: process.env.GOOGLE_CLIENT_ID, client_secret: process.env.GOOGLE_CLIENT_SECRET, redirect_uri: redirectUri, grant_type: 'authorization_code' }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error('Google 인증에 실패했습니다: ' + (j.error_description || j.error || r.status));
  // id_token은 Google 토큰 서버에서 TLS로 직접 받은 것이라 내용만 읽음 (Google 문서 권장 방식)
  let claims = {};
  try { claims = JSON.parse(Buffer.from(String(j.id_token).split('.')[1], 'base64url').toString()); } catch {}
  return { ...j, email: String(claims.email || '').toLowerCase(), emailVerified: claims.email_verified === true || claims.email_verified === 'true' };
}

// 캘린더 연결 저장
export async function saveConnection(tok) {
  const granted = String(tok.scope || '').split(' ');
  const missing = CAL_SCOPES.filter((s) => !granted.includes(s));
  if (missing.length) throw new Error('캘린더 권한이 모두 허용되지 않았습니다. 연결할 때 모든 체크박스를 허용해 주세요.');
  const prev = await getGoogle();
  const refresh = tok.refresh_token || (prev?.refreshEnc ? decrypt(prev.refreshEnc) : null);
  if (!refresh) throw new Error('Google에서 장기 접근 권한(refresh token)을 받지 못했습니다. Google 계정 → 보안 → 타사 액세스에서 이 앱을 삭제한 뒤 다시 연결해 주세요.');
  await setGoogle({ email: tok.email, refreshEnc: encrypt(refresh), connectedAt: new Date().toISOString(), status: 'ok', error: '', calendarId: 'primary' });
  cache = null;
}

let cache = null; // { token, exp }
async function accessToken() {
  if (!googleConfigured()) throw new CalendarError('Google 연동 설정(GOOGLE_CLIENT_ID/SECRET)이 아직 없습니다.', 'not_connected');
  const g = await getGoogle();
  if (!g?.refreshEnc) throw new CalendarError('Google 캘린더가 아직 연결되지 않았습니다.', 'not_connected');
  if (cache && cache.exp > Date.now() + 60000 && cache.who === g.connectedAt) return cache.token;
  const refresh = decrypt(g.refreshEnc);
  if (!refresh) throw new CalendarError('저장된 캘린더 연결 정보를 읽지 못했습니다. [설정]에서 다시 연결해 주세요.', 'expired');
  let r;
  try {
    r = await fetch(TOKEN_URL, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: process.env.GOOGLE_CLIENT_ID, client_secret: process.env.GOOGLE_CLIENT_SECRET, refresh_token: refresh, grant_type: 'refresh_token' }) });
  } catch { throw new CalendarError('Google에 연결하지 못했습니다 (네트워크).', 'network'); }
  const j = await r.json().catch(() => ({}));
  if (!r.ok) {
    if (j.error === 'invalid_grant' || r.status === 400 || r.status === 401) {
      await setGoogle({ ...g, status: 'expired', error: 'Google 캘린더 연결이 만료되었거나 해제되었습니다. [설정]에서 다시 연결해 주세요.', errorAt: new Date().toISOString() });
      await addLog('calendar', '캘린더 연결 만료 (invalid_grant)');
      throw new CalendarError('Google 캘린더 연결이 만료되었습니다.', 'expired');
    }
    throw new CalendarError('Google 인증 서버 오류 (' + r.status + ')', 'network');
  }
  if (g.status !== 'ok') await setGoogle({ ...g, status: 'ok', error: '' });
  cache = { token: j.access_token, exp: Date.now() + (Number(j.expires_in) || 3000) * 1000, who: g.connectedAt };
  return cache.token;
}

async function call(method, path, body, query, retried) {
  const t = await accessToken();
  const qs = query ? '?' + new URLSearchParams(query) : '';
  let r;
  try {
    r = await fetch(`${API}/calendar/v3${path}${qs}`, {
      method, headers: { authorization: 'Bearer ' + t, ...(body ? { 'content-type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(15000),
    });
  } catch { throw new CalendarError('Google 캘린더에 연결하지 못했습니다 (네트워크).', 'network'); }
  if (r.status === 204) return null;
  const j = await r.json().catch(() => ({}));
  if (!r.ok) {
    if (r.status === 401) {
      cache = null;
      if (!retried) return call(method, path, body, query, true); // 새 토큰으로 한 번 더 (연결이 끊겼다면 여기서 '만료'로 기록됨)
      throw new CalendarError('Google 캘린더 인증이 거부되었습니다. 다시 연결해 주세요.', 'expired');
    }
    const e = new CalendarError(`Google 캘린더 오류 (${r.status}) ${j.error?.message || ''}`.trim(), 'api');
    e.status = r.status;
    throw e;
  }
  return j;
}

export async function connectionInfo() {
  const g = await getGoogle();
  return { configured: googleConfigured(), connected: Boolean(g?.refreshEnc), email: g?.email || '', status: g?.status || '', error: g?.error || '', connectedAt: g?.connectedAt || '', calendarId: g?.calendarId || 'primary' };
}
export async function calendarId() { return (await getGoogle())?.calendarId || 'primary'; }

// 바쁜 시간만 조회 (일정 제목·내용은 받지 않음)
export async function freeBusy(fromIso, toIso, extra = []) {
  const id = await calendarId();
  const items = [id, ...extra].map((x) => ({ id: x }));
  const j = await call('POST', '/freeBusy', { timeMin: fromIso, timeMax: toIso, timeZone: 'UTC', items });
  const busy = [];
  for (const [cid, v] of Object.entries(j.calendars || {})) {
    if (v.errors?.length && cid === id) throw new CalendarError('캘린더의 바쁜 시간을 확인하지 못했습니다: ' + (v.errors[0].reason || ''), 'api');
    (v.busy || []).forEach((b) => busy.push({ start: Date.parse(b.start), end: Date.parse(b.end) }));
  }
  return busy;
}

export async function createEvent(ev, { meet, notify }) {
  const id = await calendarId();
  return call('POST', `/calendars/${encodeURIComponent(id)}/events`, ev, { conferenceDataVersion: meet ? '1' : '0', sendUpdates: notify ? 'all' : 'none' });
}
export async function patchEvent(eventId, patch, { notify, meet }) {
  const id = await calendarId();
  return call('PATCH', `/calendars/${encodeURIComponent(id)}/events/${encodeURIComponent(eventId)}`, patch, { sendUpdates: notify ? 'all' : 'none', ...(meet ? { conferenceDataVersion: '1' } : {}) });
}
export async function getEvent(eventId) {
  const id = await calendarId();
  try { return await call('GET', `/calendars/${encodeURIComponent(id)}/events/${encodeURIComponent(eventId)}`); }
  catch (e) { if (e.status === 404 || e.status === 410) return null; throw e; }
}
export async function deleteEvent(eventId, { notify }) {
  const id = await calendarId();
  try { await call('DELETE', `/calendars/${encodeURIComponent(id)}/events/${encodeURIComponent(eventId)}`, null, { sendUpdates: notify ? 'all' : 'none' }); }
  catch (e) { if (e.status === 404 || e.status === 410) return; throw e; }
}
export const meetUrlOf = (ev) => ev?.hangoutLink || ev?.conferenceData?.entryPoints?.find((p) => p.entryPointType === 'video')?.uri || '';
