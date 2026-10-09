import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { exchangeCode, saveConnection, appUrl } from '@/lib/google';
import { isAdminEmail, setSession, adminSession } from '@/lib/auth';
import { verify } from '@/lib/secure';
import { addLog } from '@/lib/store';

export const dynamic = 'force-dynamic';

export async function GET(req) {
  const base = appUrl(req);
  const q = new URL(req.url).searchParams;
  const st = verify((await cookies()).get('care_oauth')?.value);
  const back = (path) => { const r = NextResponse.redirect(base + path); r.cookies.set('care_oauth', '', { path: '/', maxAge: 0 }); return r; };
  if (!st || !q.get('state') || q.get('state') !== st.state) return back('/admin/login?error=state');
  if (q.get('error')) return back(st.mode === 'connect' ? '/admin/settings?calendar=denied' : '/admin/login?error=denied');
  let tok;
  try { tok = await exchangeCode(q.get('code') || '', base + '/api/auth/google/callback'); }
  catch { return back(st.mode === 'connect' ? '/admin/settings?calendar=failed' : '/admin/login?error=google'); }
  if (!tok.email || !tok.emailVerified || !isAdminEmail(tok.email)) {
    await addLog('auth', '관리자 명단에 없는 Google 계정의 로그인 시도');
    return back('/admin/login?error=not_admin');
  }
  if (st.mode === 'connect') {
    if (!(await adminSession())) return back('/admin/login');
    try { await saveConnection(tok); }
    catch (e) { return back('/admin/settings?calendar=failed&msg=' + encodeURIComponent(e.message)); }
    const r = back('/admin/settings?calendar=connected');
    setSession(r, tok.email);
    return r;
  }
  const r = back('/admin');
  setSession(r, tok.email);
  return r;
}
