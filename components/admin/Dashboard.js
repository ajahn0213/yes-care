'use client';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/adminApi';
import { todayLA, addDays, dowOf, localParts, fmtDate, fmtTime } from '@/lib/time';
import { MODES } from '@/lib/settings';
import BookingDrawer from './BookingDrawer';
import { BookingRow, useToast } from './common';

export function SetupAlerts({ st }) {
  if (!st) return null;
  const a = [];
  if (!st.calendar.configured) a.push(['bad', 'Google 연동 설정(GOOGLE_CLIENT_ID/SECRET)이 없습니다. 설정 안내서를 따라 Vercel에 넣어 주세요.']);
  else if (!st.calendar.connected) a.push(['warn', <>Google 캘린더가 아직 연결되지 않아 <b>온라인 신청을 받을 수 없습니다.</b> <Link className="link" href="/admin/settings">설정에서 연결하기</Link></>]);
  else if (st.calendar.status === 'expired') a.push(['bad', <><b>Google 캘린더 연결이 만료되었습니다.</b> 지금은 신청을 받을 수 없어요. <Link className="link" href="/admin/settings">다시 연결하기</Link></>]);
  if (!st.mail.ready) a.push(['warn', '메일 설정(GMAIL_USER, GMAIL_APP_PASSWORD)이 없어 확정·알림 메일이 나가지 않습니다.']);
  if (!st.settings.open) a.push(['warn', <>온라인 신청을 <b>쉬는 중</b>입니다. <Link className="link" href="/admin/settings">설정</Link></>]);
  if (!a.length) return null;
  return <div className="alerts">{a.map(([t, m], i) => <div key={i} className={'note ' + t}>{m}</div>)}</div>;
}

export default function Dashboard() {
  const [st, setSt] = useState(null);
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');
  const [open, setOpen] = useState(null);
  const [toast, toastNode] = useToast();
  const today = todayLA();

  const load = useCallback(() => {
    api('/api/admin/settings').then(setSt).catch((e) => setErr(e.message));
    api(`/api/admin/bookings?from=${addDays(today, -186)}&to=${addDays(today, 120)}`).then(setData).catch((e) => setErr(e.message));
  }, [today]);
  useEffect(load, [load]);

  const v = useMemo(() => {
    if (!data) return null;
    const list = data.bookings;
    const live = list.filter((b) => b.status !== 'cancelled');
    const dOf = (b) => localParts(b.start).date;
    const monday = addDays(today, -((dowOf(today) + 6) % 7));
    const sunday = addDays(monday, 6);
    const month = today.slice(0, 7);
    const now = Date.now();
    const months = Array.from({ length: 6 }, (_, i) => { const d = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5)) - 1 - (5 - i), 1)); return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`; });
    return {
      todayList: live.filter((b) => dOf(b) === today),
      week: live.filter((b) => dOf(b) >= monday && dOf(b) <= sunday).length,
      monthCount: live.filter((b) => dOf(b).startsWith(month)).length,
      monthDone: list.filter((b) => b.status === 'completed' && dOf(b).startsWith(month)).length,
      follow: Object.values(data.flags).filter((f) => f?.followUp).length,
      next: list.filter((b) => b.status === 'confirmed' && Date.parse(b.end) > now)[0],
      upcoming: list.filter((b) => b.status === 'confirmed' && Date.parse(b.end) > now).slice(0, 8),
      recent: [...list].sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || '')).slice(0, 6),
      changes: list.filter((b) => (b.history || []).some((h) => /변경|취소/.test(h.what) && now - Date.parse(h.at) < 14 * 864e5))
        .sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || '')).slice(0, 6),
      toClose: list.filter((b) => b.status === 'confirmed' && Date.parse(b.end) < now),
      calIssues: list.filter((b) => b.status === 'confirmed' && b.calendar && !['synced'].includes(b.calendar.status)).length,
      bars: months.map((m) => ({ m, n: list.filter((b) => b.status === 'completed' && dOf(b).startsWith(m)).length })),
    };
  }, [data, today]);

  const max = v ? Math.max(1, ...v.bars.map((x) => x.n)) : 1;
  return (
    <>
      <div className="toolbar"><h1>오늘, {fmtDate(today + 'T19:00:00Z').replace(/^\d+년 /, '')}</h1><span className="grow" /><Link className="btn small primary" href="/admin/bookings?new=1">+ 직접 등록</Link></div>
      {err && <div className="note bad">{err}</div>}
      <SetupAlerts st={st} />
      {!v ? <p className="muted">불러오는 중…</p> : (
        <>
          {v.calIssues > 0 && <div className="note warn">캘린더와 맞지 않는 예약이 <b>{v.calIssues}건</b> 있습니다. 예약을 열어 고치거나 <Link className="link" href="/admin/settings#sync">동기화 점검</Link>을 해 주세요.</div>}
          <div className="kpis">
            <div className="kpi"><div className="v">{v.todayList.length}</div><div className="l">오늘 심방</div></div>
            <div className="kpi"><div className="v">{v.week}</div><div className="l">이번 주 심방</div></div>
            <div className="kpi"><div className="v">{v.monthCount}</div><div className="l">이번 달 심방 (완료 {v.monthDone})</div></div>
            <div className="kpi"><div className="v">{v.follow}</div><div className="l">추후 연락 필요</div></div>
          </div>

          <div className="grid-2">
            <div style={{ display: 'grid', gap: 20, alignContent: 'start' }}>
              {v.next ? (
                <div className="next-card">
                  <span className="small" style={{ color: '#b8c7cb' }}>다음 심방</span>
                  <span className="when">{fmtDate(v.next.start)} {fmtTime(v.next.start)}</span>
                  <span className="who">{v.next.name}{v.next.group ? ' · ' + v.next.group : ''}</span>
                  <span className="where">{MODES[v.next.mode]?.label}{v.next.place ? ' · ' + v.next.place : ''}</span>
                  <button className="btn" onClick={() => setOpen(v.next.id)}>자세히</button>
                </div>
              ) : <div className="panel"><p className="empty">예정된 심방이 없습니다.</p></div>}

              <div className="panel">
                <div className="panel-h"><h2>오늘</h2></div>
                {v.todayList.length ? <ul className="blist">{v.todayList.map((b) => <BookingRow key={b.id} b={b} onOpen={setOpen} flags={data.flags[b.id]} />)}</ul> : <p className="empty">오늘은 심방이 없습니다.</p>}
              </div>

              {v.toClose.length > 0 && (
                <div className="panel">
                  <div className="panel-h"><h2>지난 심방 정리</h2><span className="muted small">완료·미진행을 표시하고 메모를 남겨 주세요</span></div>
                  <ul className="blist">{v.toClose.slice(-6).reverse().map((b) => <BookingRow key={b.id} b={b} onOpen={setOpen} flags={data.flags[b.id]} />)}</ul>
                </div>
              )}

              <div className="panel">
                <div className="panel-h"><h2>다가오는 심방</h2><span className="grow" /><Link className="link small" href="/admin/bookings">전체 보기</Link></div>
                {v.upcoming.length ? <ul className="blist">{v.upcoming.map((b) => <BookingRow key={b.id} b={b} onOpen={setOpen} flags={data.flags[b.id]} />)}</ul> : <p className="empty">예정된 심방이 없습니다.</p>}
              </div>
            </div>

            <div style={{ display: 'grid', gap: 20, alignContent: 'start' }}>
              <div className="panel">
                <div className="panel-h"><h2>최근 신청</h2></div>
                {v.recent.length ? <ul className="blist">{v.recent.map((b) => <BookingRow key={b.id} b={b} onOpen={setOpen} flags={data.flags[b.id]} />)}</ul> : <p className="empty">아직 신청이 없습니다. 심방 안내 링크를 청년들에게 보내 보세요.</p>}
              </div>
              <div className="panel">
                <div className="panel-h"><h2>최근 변경 · 취소</h2><span className="muted small">2주</span></div>
                {v.changes.length ? <ul className="blist">{v.changes.map((b) => <BookingRow key={b.id} b={b} onOpen={setOpen} flags={data.flags[b.id]} />)}</ul> : <p className="empty">변경이나 취소가 없습니다.</p>}
              </div>
              <div className="panel">
                <div className="panel-h"><h2>월별 완료한 심방</h2></div>
                <div className="panel-b">
                  <div className="bars" role="img" aria-label={v.bars.map((x) => `${Number(x.m.slice(5))}월 ${x.n}건`).join(', ')}>
                    {v.bars.map((x) => <div key={x.m}><i style={{ height: `${(x.n / max) * 100}%` }} /><b>{x.n}</b><span>{Number(x.m.slice(5))}월</span></div>)}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
      {open && <BookingDrawer id={open} onClose={() => setOpen(null)} onChanged={load} toast={toast} />}
      {toastNode}
    </>
  );
}
