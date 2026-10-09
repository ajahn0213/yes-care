import { NextResponse } from 'next/server';
import { authUrl, appUrl, googleConfigured } from '@/lib/google';
import { adminSession } from '@/lib/auth';
import { sign, randomToken } from '@/lib/secure';

export const dynamic = 'force-dynamic';

// mode=login: 관리자 로그인 (이메일만) / mode=connect: 캘린더 연결 (관리자만)
export async function GET(req) {
  const base = appUrl(req);
  if (!googleConfigured()) return NextResponse.redirect(base + '/admin/login?error=google_setup');
  const mode = new URL(req.url).searchParams.get('mode') === 'connect' ? 'connect' : 'login';
  const s = await adminSession();
  if (mode === 'connect' && !s) return NextResponse.redirect(base + '/admin/login');
  const state = randomToken(16);
  const res = NextResponse.redirect(authUrl({ state, mode, redirectUri: base + '/api/auth/google/callback', loginHint: s?.who?.includes('@') ? s.who : '' }));
  res.cookies.set('care_oauth', sign({ state, mode }, 600), { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: 600 });
  return res;
}
