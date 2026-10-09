import crypto from 'crypto';
import { NextResponse } from 'next/server';
import { setSession, sameOrigin, clientIp } from '@/lib/auth';
import { rateLimit, addLog } from '@/lib/store';

export const dynamic = 'force-dynamic';

// (선택) ADMIN_PASSWORD가 있을 때만 쓰는 비상용 로그인 — 기본은 Google 로그인
export async function POST(req) {
  const ap = process.env.ADMIN_PASSWORD;
  if (!ap) return NextResponse.json({ error: '비밀번호 로그인이 꺼져 있습니다. Google로 로그인해 주세요.' }, { status: 400 });
  if (!sameOrigin(req)) return NextResponse.json({ error: '잘못된 요청입니다.' }, { status: 403 });
  if (!(await rateLimit('login', clientIp(req), 8, 900))) return NextResponse.json({ error: '시도가 너무 많습니다. 15분 뒤 다시 해 주세요.' }, { status: 429 });
  const { password } = await req.json().catch(() => ({}));
  const a = crypto.createHash('sha256').update(String(password || '')).digest();
  const b = crypto.createHash('sha256').update(ap).digest();
  if (!crypto.timingSafeEqual(a, b)) {
    await addLog('auth', '관리자 비밀번호 로그인 실패');
    await new Promise((r) => setTimeout(r, 700));
    return NextResponse.json({ error: '비밀번호가 올바르지 않습니다.' }, { status: 401 });
  }
  const res = NextResponse.json({ ok: true });
  setSession(res, 'password');
  return res;
}
