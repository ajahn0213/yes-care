// 관리자 인증·요청 보호 — 서버 전용
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { sign, verify } from './secure';

export const SESSION_COOKIE = 'care_admin';
const DAYS = 14;

export const adminEmails = () => String(process.env.ADMIN_EMAILS || '').split(',').map((x) => x.trim().toLowerCase()).filter(Boolean);
export const isAdminEmail = (e) => adminEmails().includes(String(e || '').toLowerCase());

export function setSession(res, who) {
  res.cookies.set(SESSION_COOKIE, sign({ who, v: 1 }, DAYS * 86400), {
    httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: DAYS * 86400,
  });
}
export function clearSession(res) { res.cookies.set(SESSION_COOKIE, '', { httpOnly: true, path: '/', maxAge: 0 }); }

export async function adminSession() {
  const c = (await cookies()).get(SESSION_COOKIE)?.value;
  const p = verify(c);
  if (!p?.who) return null;
  // Google 로그인은 지금도 ADMIN_EMAILS에 있는지 다시 확인 (명단에서 빼면 바로 차단)
  if (p.who !== 'password' && !isAdminEmail(p.who)) return null;
  if (p.who === 'password' && !process.env.ADMIN_PASSWORD) return null;
  return p;
}

// 다른 사이트에서 몰래 보내는 요청(CSRF) 막기: 같은 출처 + 전용 헤더
export function sameOrigin(req) {
  const origin = req.headers.get('origin');
  if (!origin) return req.method === 'GET';
  try {
    const o = new URL(origin).host;
    const h = req.headers.get('x-forwarded-host') || req.headers.get('host');
    return o === h;
  } catch { return false; }
}

export async function guardAdmin(req) {
  const s = await adminSession();
  if (!s) return { error: NextResponse.json({ error: '관리자 로그인이 필요합니다.' }, { status: 401 }) };
  if (req.method !== 'GET' && (!sameOrigin(req) || req.headers.get('x-yes-care') !== '1')) {
    return { error: NextResponse.json({ error: '잘못된 요청입니다.' }, { status: 403 }) };
  }
  return { session: s };
}

export function clientIp(req) {
  return (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || req.headers.get('x-real-ip') || 'unknown';
}

export const json = (data, status = 200) => NextResponse.json(data, { status, headers: { 'cache-control': 'no-store' } });
export const fail = (msg, status = 400, extra = {}) => json({ error: msg, ...extra }, status);
