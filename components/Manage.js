'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import SlotPicker from './SlotPicker';
import Prep from './Prep';
import { fmtDate, fmtTime, tzAbbr } from '@/lib/time';
import { MODES, STATUS } from '@/lib/settings';
import { downloadIcs } from '@/lib/ics';

async function call(token, body) {
  const r = await fetch('/api/public/manage', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token, ...body }) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(j.error || '처리하지 못했어요.'), { code: j.code });
  return j;
}

export default function Manage({ token }) {
  const [v, setV] = useState(null);
  const [err, setErr] = useState('');
  const [mode, setMode] = useState(''); // '' | 'move' | 'cancel'
  const [slots, setSlots] = useState(null);
  const [pick, setPick] = useState(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  useEffect(() => { call(token, { action: 'view' }).then(setV).catch((e) => setErr(e.message)); }, [token]);
  const b = v?.booking;

  async function openMove() {
    setMode('move'); setSlots(null); setPick(null); setMsg(null);
    try { setSlots(await call(token, { action: 'slots' })); } catch (e) { setSlots({ ready: false, message: e.message }); }
  }
  async function doMove() {
    setBusy(true); setMsg(null);
    try { const j = await call(token, { action: 'reschedule', start: pick }); setV({ ...v, booking: j.booking }); setMode(''); setMsg({ ok: true, text: '일정을 바꿨어요. 바뀐 내용을 메일로도 보내 드렸어요.' }); }
    catch (e) { setMsg({ ok: false, text: e.message }); if (e.code === 'taken') openMove(); }
    finally { setBusy(false); }
  }
  async function doCancel() {
    setBusy(true); setMsg(null);
    try { const j = await call(token, { action: 'cancel', reason }); setV({ ...v, booking: j.booking, canChange: false }); setMode(''); setMsg({ ok: true, text: '예약을 취소했어요. 언제든 편한 때에 다시 신청해 주세요.' }); }
    catch (e) { setMsg({ ok: false, text: e.message }); }
    finally { setBusy(false); }
  }

  if (err) return <main className="flow"><h1 style={{ marginTop: 24 }}>예약을 찾을 수 없어요</h1><p className="lead">{err}</p><Link className="btn" href="/">처음으로</Link></main>;
  if (!b) return <main className="flow"><p className="muted" style={{ padding: '40px 0' }}>예약을 불러오는 중…</p></main>;
  const live = b.status === 'confirmed' && v.canChange;

  return (
    <main className="flow" style={{ paddingBottom: 40 }}>
      <h1 style={{ marginTop: 16 }}>{b.name}님의 심방</h1>
      <p className="lead"><span className={'tag ' + (STATUS[b.status]?.tone || 'muted')}>{STATUS[b.status]?.label}</span></p>
      <dl className="summary">
        <div><dt>일시</dt><dd>{fmtDate(b.start)}<small>{fmtTime(b.start)} – {fmtTime(b.end)} ({tzAbbr(b.start)} · 로스앤젤레스 시간)</small></dd></div>
        <div><dt>만남 방식</dt><dd>{MODES[b.mode]?.label}<small>{b.placeText}</small></dd></div>
        {b.meetUrl && b.status === 'confirmed' && <div><dt>온라인 링크</dt><dd><a href={b.meetUrl} target="_blank" rel="noreferrer">{b.meetUrl}</a></dd></div>}
        <div><dt>신청 번호</dt><dd>{b.ref}</dd></div>
      </dl>
      {msg && <div className={'note ' + (msg.ok ? 'ok' : 'bad')} role="status" style={{ marginTop: 18 }}>{msg.text}</div>}
      {b.status === 'cancelled' && <p style={{ marginTop: 18 }}><Link className="btn primary" href="/book">다시 신청하기</Link></p>}

      {live && !mode && (
        <div style={{ display: 'grid', gap: 8, marginTop: 22 }}>
          <button className="btn block" onClick={() => downloadIcs(b)}>내 캘린더에 추가</button>
          <button className="btn block" onClick={openMove}>다른 시간으로 바꾸기</button>
          <button className="btn ghost block danger" style={{ borderColor: 'transparent' }} onClick={() => { setMode('cancel'); setMsg(null); }}>예약 취소하기</button>
        </div>
      )}

      {mode === 'move' && (
        <section style={{ marginTop: 28 }}>
          <h2>새 시간 고르기</h2>
          {!slots ? <p className="muted">가능한 시간을 확인하는 중…</p>
            : !slots.ready ? <div className="note warn">{slots.message}</div>
            : Object.keys(slots.days).length === 0 ? <div className="note">지금은 옮길 수 있는 시간이 없어요. 목사님께 직접 연락해 주세요.</div>
            : <SlotPicker days={slots.days} value={pick} onChange={(s) => setPick(s)} />}
          <div style={{ display: 'grid', gap: 8, marginTop: 18 }}>
            <button className="btn primary block" disabled={!pick || busy} onClick={doMove}>{busy ? '바꾸는 중…' : pick ? `${fmtDate(pick)} ${fmtTime(pick)}로 바꾸기` : '시간을 골라 주세요'}</button>
            <button className="btn ghost block" onClick={() => setMode('')}>그대로 두기</button>
          </div>
        </section>
      )}

      {mode === 'cancel' && (
        <section style={{ marginTop: 28 }} className="form-grid">
          <h2>정말 취소할까요?</h2>
          <label className="field">목사님께 남길 말<span className="opt">(선택)</span>
            <textarea value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} placeholder="예: 회사 일정이 생겼어요. 다음 주에 다시 신청할게요." />
          </label>
          <button className="btn danger primary block" disabled={busy} onClick={doCancel}>{busy ? '취소하는 중…' : '예약 취소하기'}</button>
          <button className="btn ghost block" onClick={() => setMode('')}>취소하지 않기</button>
        </section>
      )}

      {b.status === 'confirmed' && <div style={{ marginTop: 12 }}><Prep /></div>}
    </main>
  );
}
