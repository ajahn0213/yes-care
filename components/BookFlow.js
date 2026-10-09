'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import SlotPicker from './SlotPicker';
import { loadDraft, saveDraft, clearDraft, saveDone } from '@/lib/draft';
import { fmtDate, fmtTime, tzAbbr } from '@/lib/time';
import { MODES } from '@/lib/settings';

const STEPS = { time: 1, details: 2, confirm: 3 };

function Top({ step, back }) {
  return (
    <div className="flow-top">
      <Link className="back" href={back}>‹ 이전</Link>
      <div className="steps" role="progressbar" aria-valuemin={1} aria-valuemax={3} aria-valuenow={STEPS[step]} aria-label={`3단계 중 ${STEPS[step]}단계`}>
        {[1, 2, 3].map((n) => <i key={n} className={n <= STEPS[step] ? 'on' : ''} />)}
      </div>
    </div>
  );
}

const endOf = (start, min) => new Date(Date.parse(start) + (min || 60) * 60000).toISOString();

export default function BookFlow({ step }) {
  const router = useRouter();
  const [d, setD] = useState(null);
  useEffect(() => {
    const x = loadDraft();
    if (step !== 'time' && !x.start) { router.replace('/book'); return; }
    if (step === 'confirm' && (!x.name || !x.email || !x.mode)) { router.replace('/book/details'); return; }
    setD(x);
  }, [step]); // eslint-disable-line
  if (!d) return <main className="flow"><p className="muted" style={{ padding: '40px 0' }}>불러오는 중…</p></main>;
  if (step === 'time') return <TimeStep d={d} setD={setD} />;
  if (step === 'details') return <DetailsStep d={d} setD={setD} />;
  return <ConfirmStep d={d} />;
}

// ---------- 1. 일정 고르기
function TimeStep({ d, setD }) {
  const router = useRouter();
  const [av, setAv] = useState(null);
  const [err, setErr] = useState('');
  const load = () => {
    setErr(''); setAv(null);
    fetch('/api/public/availability', { cache: 'no-store' })
      .then((r) => r.json())
      .then((j) => { setAv(j); if (j.durationMin) setD((x) => saveDraft({ ...x, durationMin: j.durationMin })); })
      .catch(() => setErr('인터넷 연결을 확인하고 다시 시도해 주세요.'));
  };
  useEffect(load, []); // eslint-disable-line
  const pick = (start) => setD(saveDraft({ start: start || '' }));
  // 고른 시간이 이제는 없으면 선택 해제
  const stillOpen = av?.days && d.start && Object.values(av.days).some((l) => l.some((x) => x.start === d.start));
  const has = av?.ready && Object.keys(av.days || {}).length > 0;

  return (
    <main className="flow">
      <Top step="time" back="/" />
      <h1>언제 만날까요?</h1>
      <p className="lead">가능한 날짜와 시간만 보여요. 한 번의 만남은 {av?.durationMin || 60}분입니다.</p>
      {err && <div className="note bad">{err} <button className="link" onClick={load}>다시 불러오기</button></div>}
      {!av && !err && <p className="muted">목사님 일정을 확인하고 있어요…</p>}
      {av && !av.ready && (
        <div className="note warn"><b>{av.message || '지금은 온라인 신청을 받을 수 없어요.'}</b><br />급하시면 목사님께 카카오톡이나 문자로 직접 연락해 주세요.</div>
      )}
      {av?.ready && !has && <div className="note">앞으로 {av.horizonDays}일 안에 신청할 수 있는 시간이 모두 찼어요. 며칠 뒤 다시 확인하시거나 목사님께 직접 연락해 주세요.</div>}
      {has && <SlotPicker days={av.days} value={stillOpen ? d.start : null} onChange={pick} horizonDays={av.horizonDays} />}
      {has && (
        <div className="actionbar">
          <div className="in">
            <p className="sel" aria-live="polite">{stillOpen ? <><b>{fmtDate(d.start)} {fmtTime(d.start)}</b> – {fmtTime(endOf(d.start, d.durationMin))}</> : '시간을 골라 주세요'}</p>
            <button className="btn primary block" disabled={!stillOpen} onClick={() => router.push('/book/details')}>다음</button>
          </div>
        </div>
      )}
    </main>
  );
}

// ---------- 2. 만남 방식 + 정보
function DetailsStep({ d, setD }) {
  const router = useRouter();
  const [f, setF] = useState({ mode: '', place: '', name: '', email: '', phone: '', group: '', topics: '', prayer: '', consent: false, ...d });
  const [errs, setErrs] = useState({});
  const set = (k) => (e) => { setF((x) => ({ ...x, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value })); if (errs[k]) setErrs((x) => { const n = { ...x }; delete n[k]; return n; }); };
  function next(e) {
    e.preventDefault();
    const er = {};
    if (!f.mode) er.mode = '만남 방식을 골라 주세요.';
    if (!f.name.trim()) er.name = '이름을 적어 주세요.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(f.email.trim())) er.email = '이메일 주소를 확인해 주세요. 예약 안내를 이 주소로 보내 드려요.';
    if (f.phone && f.phone.replace(/\D/g, '').length < 7) er.phone = '휴대전화 번호를 확인해 주세요.';
    if (!f.consent) er.consent = '개인정보 이용 안내를 확인하고 체크해 주세요.';
    setErrs(er);
    if (Object.keys(er).length) { document.getElementById('f-' + Object.keys(er)[0])?.focus(); return; }
    setD(saveDraft({ ...f, name: f.name.trim(), email: f.email.trim() }));
    router.push('/book/confirm');
  }
  const E = ({ k }) => (errs[k] ? <span className="err" id={'e-' + k}>{errs[k]}</span> : null);
  const fieldCls = (k) => 'field' + (errs[k] ? ' bad' : '');

  return (
    <main className="flow">
      <Top step="details" back="/book" />
      <h1>어떻게 만날까요?</h1>
      <p className="lead">{fmtDate(d.start)} {fmtTime(d.start)} · {d.durationMin || 60}분</p>
      <form onSubmit={next} noValidate>
        <section>
          <h2>만남 방식</h2>
          <div className="modes" role="radiogroup" aria-describedby={errs.mode ? 'e-mode' : undefined}>
            {Object.entries(MODES).map(([k, m], i) => (
              <label key={k} className="mode">
                <input id={i === 0 ? 'f-mode' : undefined} type="radio" name="mode" value={k} checked={f.mode === k} onChange={set('mode')} />
                <span><b>{m.label}</b><span>{m.desc}</span></span>
              </label>
            ))}
          </div>
          <E k="mode" />
          {f.mode === 'outside' && (
            <div className="mode-extra">
              <label className="field">희망 지역이나 장소<span className="opt">(선택)</span>
                <input value={f.place} onChange={set('place')} maxLength={200} placeholder="예: 풀러턴 근처 카페, 회사 근처" />
                <span className="help">아직 정하지 못했으면 비워 두세요. ‘장소 추후 협의’로 표시하고 함께 정해요.</span>
              </label>
            </div>
          )}
          {f.mode === 'church' && (
            <div className="mode-extra">
              <label className="field">교회 안 원하는 곳<span className="opt">(선택)</span>
                <input value={f.place} onChange={set('place')} maxLength={200} placeholder="예: 청년부실, 카페 공간" />
              </label>
            </div>
          )}
          {f.mode === 'online' && <p className="note mode-extra">예약이 확정되면 Google Meet 링크를 메일로 보내 드려요.</p>}
        </section>

        <section className="form-grid">
          <h2>신청하시는 분</h2>
          <label className={fieldCls('name')}>이름
            <input id="f-name" value={f.name} onChange={set('name')} autoComplete="name" maxLength={40} aria-invalid={!!errs.name} />
            <E k="name" />
          </label>
          <label className={fieldCls('email')}>이메일
            <input id="f-email" type="email" inputMode="email" autoCapitalize="none" autoCorrect="off" value={f.email} onChange={set('email')} autoComplete="email" maxLength={120} aria-invalid={!!errs.email} />
            <span className="help">예약 확정 안내와 변경·취소 링크를 이 주소로 보내 드려요.</span>
            <E k="email" />
          </label>
          <label className={fieldCls('phone')}>휴대전화<span className="opt">(선택)</span>
            <input id="f-phone" type="tel" inputMode="tel" value={f.phone} onChange={set('phone')} autoComplete="tel" maxLength={30} />
            <E k="phone" />
          </label>
          <label className="field">소속 공동체 또는 순<span className="opt">(선택)</span>
            <input value={f.group} onChange={set('group')} maxLength={60} placeholder="예: 제자반, 2공동체 ○○순" />
          </label>
        </section>

        <section className="form-grid">
          <h2>미리 나누고 싶은 것<span className="muted" style={{ fontWeight: 500, fontSize: 14, marginLeft: 6 }}>(선택)</span></h2>
          <p className="muted small" style={{ marginTop: -6 }}>비워 두셔도 괜찮아요. 자세한 이야기는 만나서 편하게 나눠요. 다른 사람의 개인적인 사정이나 민감한 정보는 적지 않으셔도 됩니다.</p>
          <label className="field">함께 나누고 싶은 이야기
            <textarea value={f.topics} onChange={set('topics')} maxLength={1500} placeholder="예: 요즘 감사한 일, 진로 고민, 신앙의 질문" />
          </label>
          <label className="field">기도 제목
            <textarea value={f.prayer} onChange={set('prayer')} maxLength={1500} />
          </label>
        </section>

        <section className="form-grid">
          <div className="privacy note">
            <b>개인정보 이용 안내</b><br />
            적어 주신 이름·연락처·내용은 <b>심방 일정 안내와 목양을 위해서만</b> 쓰입니다. 담당 목사님만 볼 수 있고, 다른 신청자나 외부에 공개되지 않습니다.
            나누고 싶은 이야기와 기도 제목은 메일이나 캘린더에 넣지 않고 앱 안에만 안전하게 보관하며, 일정 기간이 지나면 삭제합니다. 삭제를 원하시면 목사님께 말씀해 주세요.
          </div>
          <label className="check">
            <input id="f-consent" type="checkbox" checked={f.consent} onChange={set('consent')} />
            <span>위 안내를 확인했어요.</span>
          </label>
          <E k="consent" />
          <div className="hp" aria-hidden="true"><label>웹사이트<input tabIndex={-1} autoComplete="off" value={f.website || ''} onChange={set('website')} /></label></div>
        </section>

        <div className="actionbar">
          <div className="in"><button className="btn primary block" type="submit">확인하기</button></div>
        </div>
      </form>
    </main>
  );
}

// ---------- 3. 최종 확인 → 확정
function ConfirmStep({ d }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const placeLine = d.mode === 'online' ? '온라인 · Google Meet (링크는 메일로)' : d.mode === 'church' ? (d.place ? `교회 · ${d.place}` : '교회') : (d.place || '장소 추후 협의');

  async function submit() {
    setBusy(true); setErr(null);
    try {
      const r = await fetch('/api/public/book', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ start: d.start, mode: d.mode, place: d.place, name: d.name, email: d.email, phone: d.phone, group: d.group, topics: d.topics, prayer: d.prayer, consent: !!d.consent, website: d.website || '' }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setErr({ msg: j.error || '예약을 확정하지 못했어요.', code: j.code || (r.status >= 500 ? 'server' : '') }); return; }
      saveDone({ booking: j.booking, manageUrl: j.manageUrl, email: d.email });
      clearDraft();
      router.replace('/booking/success');
    } catch {
      setErr({ msg: '인터넷 연결이 끊겨 예약 여부를 확인하지 못했어요. 잠시 후 받은 메일함을 확인하시고, 메일이 없으면 다시 신청해 주세요.', code: 'network' });
    } finally { setBusy(false); }
  }

  return (
    <main className="flow">
      <Top step="confirm" back="/book/details" />
      <h1>이렇게 신청할까요?</h1>
      <p className="lead">내용을 확인하고 아래 버튼을 눌러야 예약이 확정됩니다.</p>
      <dl className="summary">
        <div><dt>날짜</dt><dd>{fmtDate(d.start)}<Link className="link edit" href="/book">바꾸기</Link></dd></div>
        <div><dt>시간</dt><dd>{fmtTime(d.start)} – {fmtTime(endOf(d.start, d.durationMin))}<small>{tzAbbr(d.start)} · 로스앤젤레스 시간</small></dd></div>
        <div><dt>만남 방식</dt><dd>{MODES[d.mode]?.label}<small>{placeLine}</small><Link className="link edit" href="/book/details">바꾸기</Link></dd></div>
        <div><dt>이름</dt><dd>{d.name}{d.group ? <small>{d.group}</small> : null}</dd></div>
        <div><dt>연락처</dt><dd>{d.email}{d.phone ? <small>{d.phone}</small> : null}</dd></div>
        {(d.topics || d.prayer) && <div><dt>나눌 이야기</dt><dd style={{ fontWeight: 500 }}>{[d.topics, d.prayer && '기도 제목: ' + d.prayer].filter(Boolean).join('\n\n')}</dd></div>}
      </dl>
      {err && (
        <div className={'note ' + (err.code === 'taken' ? 'warn' : 'bad')} role="alert" style={{ marginTop: 20 }}>
          <b>{err.code === 'taken' ? '이 시간은 이제 신청할 수 없어요.' : '예약이 확정되지 않았어요.'}</b><br />{err.msg}
          {err.code === 'taken' && <div style={{ marginTop: 10 }}><button className="btn small" onClick={() => { saveDraft({ start: '' }); router.push('/book'); }}>다른 시간 고르기</button></div>}
        </div>
      )}
      <div className="actionbar">
        <div className="in"><button className="btn primary block" disabled={busy} onClick={submit}>{busy ? '목사님 캘린더에 등록하는 중…' : '심방 예약 확정하기'}</button></div>
      </div>
    </main>
  );
}
