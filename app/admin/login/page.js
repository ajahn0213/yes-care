import { redirect } from 'next/navigation';
import { adminSession } from '@/lib/auth';
import { googleConfigured } from '@/lib/google';
import LoginForm from '@/components/admin/LoginForm';

export const metadata = { title: 'YES 심방 · 관리자 로그인' };
export const dynamic = 'force-dynamic';

const ERR = {
  not_admin: '이 Google 계정은 관리자로 등록되어 있지 않습니다. Vercel의 ADMIN_EMAILS에 이메일을 넣어 주세요.',
  google: 'Google 로그인에 실패했습니다. 다시 시도해 주세요.',
  denied: 'Google 로그인을 취소했습니다.',
  state: '로그인 시간이 지났습니다. 다시 시도해 주세요.',
  google_setup: 'Google 로그인 설정(GOOGLE_CLIENT_ID/SECRET)이 아직 없습니다. 설정 안내서를 따라 넣어 주세요.',
};

export default async function Page({ searchParams }) {
  if (await adminSession()) redirect('/admin');
  const sp = await searchParams;
  return <LoginForm google={googleConfigured()} password={Boolean(process.env.ADMIN_PASSWORD)} error={ERR[sp?.error] || ''} />;
}
