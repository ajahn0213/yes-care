'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { api } from '@/lib/adminApi';
import { todayLA, addDays, localParts } from '@/lib/time';
import { MODES } from '@/lib/settings';
import BookingDrawer from './BookingDrawer';
import { BookingRow, useToast } from './common';

const VIEWS = [['upcoming', '다가오는'], ['past', '지난'], ['cancelled', '취소'], ['all', '전체']];

export default function Bookings() {
  const sp = useSearchParams();
  const router = useRouter();
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');
  const [view, setView] = useState('upcoming');
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(sp.get('id'));
  const [adding, setAdding] = useState(sp.get('new') === '1');
  const [toast, toastNode] = useToast();

  const load = useCallback(() => { api('/api/admin/bookings').then(setData).catch((e) => setErr(e.message)); }, []);
  useEffect(load, [load]);
  useEffect(() => { setOpen(sp.get('id')); }, [sp]);
  const close = () => { setOpen(null); if (sp.get('id')) router.replace('/admin/bookings'); };

  const list = useMemo(() => {
    if (!data) return [];
    const now = Date.now();
    const s = q.trim().toLowerCase();
    let l = data.bookings.filter((b) => !s || [b.name, b.email, b.phone, b.group, b.ref].some((x) => (x || '').toLowerCase().includes(s)));
    if (view === 'upcoming') l = l.filter((b) => b.status === 'confirmed' && Date.parse(b.end) > now);
    if (view === 'past') l = l.filter((b) => b.status !== 'cancelled' && Date.parse(b.end) <= now).reverse();
    if (view === 'cancelled') l = l.filter((b) => b.status === 'cancelled').reverse();
    if (view === 'all') l = [...l].reverse();
    return l;
  }, [data, view, q]);

  return (
    <>
      <div className="toolbar">
        <h1>심방 예약</h1><span className="grow" />
        <button className="btn small primary" onClick={() => setAdding(true)}>+ 직접 등록</button>
      </div>
      <div className="toolbar">
        <div className="seg" role="group" aria-label="보기">{VIEWS.map(([k, l]) => <button key={k} aria-pressed={view === k} onClick={() => setView(k)}>{l}</button>)}</div>
        <span className="grow" />
        <input className="input" style={{ maxWidth: 260, minHeight: 40 }} placeholder="이름·이메일·소속 찾기" value={q} onChange={(e) => setQ(e.target.value)} aria-label="찾기" />
      </div>
      {err && <div className="note bad">{err}</div>}
      <div className="panel">
        {!data ? <p className="empty">불러오는 중…</p> : list.length === 0 ? <p className="empty">{view === 'upcoming' ? '다가오는 심방이 없습니다.' : '해당하는 기록이 없습니다.'}</p>
          : <ul className="blist">{list.map((b) => <BookingRow key={b.id} b={b} onOpen={setOpen} flags={data.flags[b.id]} />)}</ul>}
      </div>
      {open && <BookingDrawer id={open} onClose={close} onChanged={load} toast={toast} />}
      {adding && <NewBooking onClose={() => { setAdding(false); if (sp.get('new')) router.replace('/admin/bookings'); }} onDone={(id) => { setAdding(false); load(); setOpen(id); toast('등록했습니다'); }} />}
      {toastNode}
    </>
  );
}

// 전화·카톡으로 정한 일정 직접 등록
function NewBooking({ onClose, onDone }) {
  const [f, setF] = useState({ date: addDays(todayLA(), 1), time: '14:00', name: '', email: '', phone: '', group: '', mode: 'church', place: '', topics: '', prayer: '' });
  const [force, setForce] = useState(false);
  const [sendMail, setSendMail] = useState(true);
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  async function save(forceIt) {
    setBusy(true); setErr(null);
    try {
      const { date, time, ...input } = f;
      const j = await api('/api/admin/bookings', { action: 'create', date, time, input, force: forceIt || force, sendMail: sendMail && !!f.email });
      onDone(j.booking.id);
    } catch (e) { setErr({ msg: e.message, clash: e.code === 'clash' }); }
    finally { setBusy(false); }
  }
  return (
    <div className="drawer-bg" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <aside className="drawer" role="dialog" aria-modal="true" aria-label="심방 직접 등록">
        <div className="drawer-h"><h2>심방 직접 등록</h2><button className="x" onClick={onClose} aria-label="닫기">×</button></div>
        <div className="drawer-b">
          <p className="muted small">전화나 카카오톡으로 정한 일정을 등록하면 Google 캘린더에도 함께 만들어집니다.</p>
          <div className="row">
            <label className="field">날짜<input type="date" value={f.date} onChange={set('date')} /></label>
            <label className="field">시작 시간<input type="time" step="900" value={f.time} onChange={set('time')} /></label>
          </div>
          <div className="row">
            <label className="field">이름<input value={f.name} onChange={set('name')} /></label>
            <label className="field">소속<span className="opt">(선택)</span><input value={f.group} onChange={set('group')} /></label>
          </div>
          <div className="row">
            <label className="field">이메일<span className="opt">(선택)</span><input type="email" value={f.email} onChange={set('email')} /></label>
            <label className="field">휴대전화<span className="opt">(선택)</span><input value={f.phone} onChange={set('phone')} /></label>
          </div>
          <div className="row">
            <label className="field">만남 방식<select value={f.mode} onChange={set('mode')}>{Object.entries(MODES).map(([k, m]) => <option key={k} value={k}>{m.label}</option>)}</select></label>
            {f.mode !== 'online' && <label className="field">장소<span className="opt">(선택)</span><input value={f.place} onChange={set('place')} /></label>}
          </div>
          <label className="field">나눌 이야기<span className="opt">(선택)</span><textarea value={f.topics} onChange={set('topics')} /></label>
          <label className="check"><input type="checkbox" checked={force} onChange={(e) => setForce(e.target.checked)} /><span>다른 일정과 겹쳐도 등록</span></label>
          {f.email && <label className="check"><input type="checkbox" checked={sendMail} onChange={(e) => setSendMail(e.target.checked)} /><span>신청자에게 확정 메일 보내기 (변경·취소 링크 포함)</span></label>}
          {err && <div className={'note ' + (err.clash ? 'warn' : 'bad')}>{err.msg}{err.clash && <div style={{ marginTop: 8 }}><button className="btn small" disabled={busy} onClick={() => save(true)}>겹쳐도 등록</button></div>}</div>}
          <button className="btn primary" disabled={busy || !f.name.trim() || !f.date || !f.time} onClick={() => save(false)}>{busy ? '등록하는 중…' : '등록하기'}</button>
        </div>
      </aside>
    </div>
  );
}
