'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const NAV = [['/admin', '대시보드'], ['/admin/bookings', '심방 예약'], ['/admin/calendar', '캘린더'], ['/admin/people', '대상자'], ['/admin/settings', '설정']];

export default function AdminShell({ who, children }) {
  const path = usePathname();
  async function logout() { await fetch('/api/auth/logout', { method: 'POST' }); window.location.href = '/admin/login'; }
  return (
    <div className="admin">
      <div className="stripe" aria-hidden="true"><i /><i /><i /><i /></div>
      <header className="admin-top">
        <div className="in">
          <div className="row1">
            <img src="/brand/yes-mark-ink.png" alt="YES" />
            <span className="t">YES 심방 관리</span>
            <span className="who">{who}</span>
            <button className="btn small" onClick={logout}>로그아웃</button>
          </div>
          <nav className="admin-nav" aria-label="관리 메뉴">
            {NAV.map(([href, l]) => <Link key={href} href={href} className={(href === '/admin' ? path === href : path.startsWith(href)) ? 'on' : ''}>{l}</Link>)}
          </nav>
        </div>
      </header>
      <main className="admin-main">{children}</main>
    </div>
  );
}
