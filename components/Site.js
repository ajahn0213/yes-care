import Link from 'next/link';
import { T } from '@/lib/copy';

export function SiteHead() {
  return (
    <>
      <div className="stripe" aria-hidden="true"><i /><i /><i /><i /></div>
      <header className="site-head">
        <Link href="/" className="home" aria-label="YES 심방 처음으로">
          <img src="/brand/yes-mark-ink.png" alt="YES" />
          <span className="name">YES 심방<span>Pastoral Care</span></span>
        </Link>
        <span className="grow" />
        <img className="church" src="/brand/srcc-alt.png" alt="남가주 사랑의교회" />
      </header>
    </>
  );
}

export function SiteFoot() {
  return (
    <footer className="site-foot">
      <div className="in">
        <img src="/brand/srcc-alt.png" alt="남가주 사랑의교회" />
        <p className="care">{T.crisis}</p>
        <p>남가주 사랑의교회 YES 청년부 · 1111 N Brookhurst St, Anaheim, CA 92801</p>
      </div>
    </footer>
  );
}
