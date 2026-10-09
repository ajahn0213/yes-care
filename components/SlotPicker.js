'use client';
import { useEffect, useMemo, useState } from 'react';
import { DOW_KO, fmtDateShort, fmtTimeHM, todayLA, addDays } from '@/lib/time';

const ym = (d) => d.slice(0, 7);
function monthCells(month) {
  const [y, m] = month.split('-').map(Number);
  const first = new Date(Date.UTC(y, m - 1, 1));
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const cells = Array.from({ length: first.getUTCDay() }, () => null);
  for (let d = 1; d <= days; d++) cells.push(`${month}-${String(d).padStart(2, '0')}`);
  return cells;
}
const shiftMonth = (month, n) => { const [y, m] = month.split('-').map(Number); const x = new Date(Date.UTC(y, m - 1 + n, 1)); return `${x.getUTCFullYear()}-${String(x.getUTCMonth() + 1).padStart(2, '0')}`; };

// days: { 'YYYY-MM-DD': [{ start, time }] } — 가능한 날짜만 누를 수 있음
export default function SlotPicker({ days, value, onChange, horizonDays = 30 }) {
  const dates = useMemo(() => Object.keys(days).sort(), [days]);
  const today = todayLA();
  const lastDay = addDays(today, horizonDays);
  const valueDate = value ? Object.keys(days).find((d) => days[d].some((x) => x.start === value)) : null;
  const [month, setMonth] = useState(ym(valueDate || dates[0] || today));
  const [date, setDate] = useState(valueDate || null);
  useEffect(() => { if (valueDate) setDate(valueDate); }, [valueDate]);
  const cells = monthCells(month);
  const list = date ? days[date] || [] : [];
  const [y, m] = month.split('-').map(Number);

  return (
    <div>
      <div className="cal" role="group" aria-label="날짜 고르기">
        <div className="cal-head">
          <button type="button" onClick={() => setMonth(shiftMonth(month, -1))} disabled={month <= ym(today)} aria-label="이전 달">‹</button>
          <h3 aria-live="polite">{y}년 {m}월</h3>
          <button type="button" onClick={() => setMonth(shiftMonth(month, 1))} disabled={month >= ym(lastDay)} aria-label="다음 달">›</button>
        </div>
        <div className="cal-grid">
          {DOW_KO.map((d, i) => <div key={d} className={'cal-dow' + (i === 0 ? ' sun' : '')} aria-hidden="true">{d}</div>)}
          {cells.map((d, i) => {
            if (!d) return <span key={'e' + i} className="cal-day empty" />;
            const ok = !!days[d];
            const cls = ['cal-day', ok && 'avail', d === date && 'sel', d === today && 'today'].filter(Boolean).join(' ');
            return (
              <button type="button" key={d} className={cls} disabled={!ok} aria-pressed={d === date}
                aria-label={`${fmtDateShort(d)}${ok ? `, 가능한 시간 ${days[d].length}개` : ', 신청할 수 없는 날'}`}
                onClick={() => { setDate(d); if (value && !days[d].some((x) => x.start === value)) onChange(null); }}>
                {Number(d.slice(8))}
              </button>
            );
          })}
        </div>
      </div>
      <div style={{ marginTop: 22 }} aria-live="polite">
        {!date ? <p className="times-empty">점이 있는 날짜를 누르면 가능한 시간이 보여요.</p> : (
          <>
            <h2 style={{ marginBottom: 12 }}>{fmtDateShort(date)}</h2>
            <div className="times">
              {list.map((x) => (
                <button type="button" key={x.start} aria-pressed={x.start === value} onClick={() => onChange(x.start, date, x.time)}>{fmtTimeHM(x.time)}</button>
              ))}
            </div>
          </>
        )}
        <p className="tz-note">시간은 모두 로스앤젤레스(태평양) 시간입니다.</p>
      </div>
    </div>
  );
}
