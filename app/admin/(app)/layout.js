import { redirect } from 'next/navigation';
import { adminSession } from '@/lib/auth';
import AdminShell from '@/components/admin/AdminShell';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'YES 심방 · 관리' };

export default async function Layout({ children }) {
  const s = await adminSession();
  if (!s) redirect('/admin/login');
  return <AdminShell who={s.who === 'password' ? '관리자' : s.who}>{children}</AdminShell>;
}
