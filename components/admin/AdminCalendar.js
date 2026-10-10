'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/adminApi';
import { isBlackout } from '@/lib/settings';
import { todayLA, addDays, dowOf, localParts, fmtTime, DOW_KO } from '@/lib/time';
import BookingDrawer from './BookingDrawer';
import { useToast } from './common';

const shift = (month, n) => { const [y, m] = month.split('-').map(Number); const x = new Date(Date.UTC(y, m - 1 + n, 1)); return `${x.getUTCFullYear()}-${String(x.getUTCMonth() + 1).padStart(2, '0')}`; };

export default function AdminCalendar() {
  const today = todayLA();
  const [month, setMonth] = useState(today.slice(0, 7));
  const [data, setData] = useState(null);
  const [settings, setSettings] = useState(null);
  const [open, setOpen] = useState(null);
  const [toast, toastNode] = useToast();
  const first = month + '-01';
  const start = addDays(first, -dowOf(first));
  const cells = Array.from({ length: 42 }, (_, i) => addDays(start, i));
  const weeks = cells[35].slice(0, 7) === month ? 6 : 5;

  const load = useCallback(() => {
    api(`/api/admin/bookings?from=${cells[0]}&to=${cells[weeks * 7 - 1]}`).then(setData).catch(() => {});
  }, [month]); // eslint-disable-line
  useEffect(load, [load]);
  useEffect(() => { api('/api/admin/settings').then((j) => setSettings(j.settings)).catch(() => {}); }, []);
  const byDay = useMemo(() => {
    const m = {};
    (data?.bookings || []).forEach((b) => { const d = localParts(b.start).date; (m[d] = m[d] || []).push(b); });
    return m;
  }, [data]);
  const off = (d) => settings && ((settings.weekly[dowOf(d)] || []).length === 0 || isBlackout(settings.blackouts, d));
  const [y, m] = month.split('-').map(Number);

  return (
    <>
      <div className="toolbar">
        <h1>{y}년 {m}월</h1><span className="grow" />
        <button className="btn small" onClick={() => setMonth(shift(month, -1))} aria-label="이전 달">‹</button>
        <button className="btn small" onClick={() => setMonth(today.slice(0, 7))}>이번 달</button>
        <button className="btn small" onClick={() => setMonth(shift(month, 1))} aria-label="다음 달">›</button>
      </div>
      <p className="muted small">빗금 친 날은 신청을 받지 않는 날(요일 설정·휴무일)입니다. 개인 일정은 Google 캘린더에서 확인하세요.</p>
      <div className="mcal">
        {DOW_KO.map((d) => <div key={d} className="dow">{d}</div>)}
        {cells.slice(0, weeks * 7).map((d) => (
          <div key={d} className={['day', d.slice(0, 7) !== month && 'out', d === today && 'today', off(d) && 'off'].filter(Boolean).join(' ')}>
            <span className="num">{Number(d.slice(8))}</span>
            {(byDay[d] || []).map((b) => <button key={b.id} className={'ev ' + b.status} onClick={() => setOpen(b.id)} title={`${fmtTime(b.start)} ${b.name}`}>{localParts(b.start).time} {b.name}</button>)}
          </div>
        ))}
      </div>
      {open && <BookingDrawer id={open} onClose={() => setOpen(null)} onChanged={load} toast={toast} />}
      {toastNode}
    </>
  );
}
