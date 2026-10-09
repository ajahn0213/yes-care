import Link from 'next/link';
import { SiteHead, SiteFoot } from '@/components/Site';
import { T } from '@/lib/copy';
import { MODES } from '@/lib/settings';

export default function Home() {
  return (
    <>
      <SiteHead />
      <main className="intro">
        <section className="hero">
          <div>
            <p className="label">{T.label}</p>
            <h1>{T.title}</h1>
            <p className="sub">{T.subtitle}</p>
            <div className="cta">
              <Link className="btn primary block" href="/book">{T.cta}</Link>
              <p>{T.ctaSub}</p>
            </div>
            <div className="facts">
              <span>만남 시간 <b>60분</b></span>
              <span>장소 <b>교회 · 교회 밖 · 온라인</b></span>
              <span>회원가입 <b>필요 없어요</b></span>
            </div>
          </div>

          <figure className="hanja" aria-label="심방의 한자 뜻">
            <div className="row" aria-hidden="true">
              <div className="ch"><span className="glyph">尋</span><span className="gloss"><b>찾을 심</b></span></div>
              <div className="ch"><span className="glyph">訪</span><span className="gloss"><b>찾을 방</b></span></div>
            </div>
            <p className="sr-only">심방은 찾을 심(尋), 찾을 방(訪)을 씁니다.</p>
            <div className="turn">
              <span className="glyph" aria-hidden="true"><em>心</em>訪</span>
              <p>
                마음을 방문하는 시간.
                <small>心訪은 정식 표기가 아니라, 심방을 마음의 방문으로 새겨 본 목회적 해석입니다.</small>
              </p>
            </div>
          </figure>
        </section>

        <section className="story">
          <h2>{T.message}</h2>
          <div className="body">
            {T.intro.map((p) => <p key={p}>{p}</p>)}
            <blockquote>{T.quote}</blockquote>
            <div>
              <p>이런 이야기를 나눠요. 무엇이든 괜찮습니다.</p>
              <div className="topics">{T.topics.map((t) => <span key={t}>{t}</span>)}</div>
            </div>
          </div>
        </section>

        <section className="ways">
          <h2>꼭 집이 아니어도 괜찮아요</h2>
          <ul>
            {Object.entries(MODES).map(([k, m]) => (
              <li key={k}><b>{m.label}</b><span>{k === 'church' ? '교회에서 편하게 만나요.' : k === 'outside' ? '카페, 식당, 집 근처 등 편한 곳을 알려 주세요. 정하지 못했으면 나중에 함께 정해요.' : '멀리 있거나 시간이 빠듯할 때, Google Meet 화상으로 만나요.'}</span></li>
            ))}
          </ul>
        </section>

        <section className="final">
          <h2>“{T.ctaSub}”</h2>
          <Link className="btn primary" href="/book">{T.cta}</Link>
        </section>
      </main>
      <SiteFoot />
    </>
  );
}
