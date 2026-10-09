'use client';
import { useCallback, useState } from 'react';
import { localParts, fmtTime, DOW_KO, dowOf } from '@/lib/time';
import { StatusTag, CalTag } from './BookingDrawer';

export function useToast() {
  const [msg, setMsg] = useState('');
  const toast = useCallback((m) => { setMsg(m); setTimeout(() => setMsg(''), 2600); }, []);
  const node = msg ? <div className="toast" role="status">{msg}</div> : null;
  return [toast, node];
}

const md = (date) => `${Number(date.slice(5, 7))}/${Number(date.slice(8, 10))} (${DOW_KO[dowOf(date)]})`;
const MODE_SHORT = { church: '교회', outside: '교회 밖', online: '온라인' };

export function BookingRow({ b, onOpen, flags }) {
  const d = localParts(b.start).date;
  return (
    <li>
      <button className="brow" onClick={() => onOpen(b.id)}>
        <span className="d">{md(d)}<small>{fmtTime(b.start)}</small></span>
        <span>
          <span className="n">{b.name}{b.group ? <small>{b.group}</small> : null}</span>
          <span className="m" style={{ display: 'block' }}>{MODE_SHORT[b.mode]}{b.mode === 'outside' ? ' · ' + (b.place || '장소 추후 협의') : b.place ? ' · ' + b.place : ''}{flags?.followUp ? ' · 추후 연락 필요' : ''}</span>
        </span>
        <span className="tags tag-wrap"><CalTag c={b.calendar} status={b.status} /><StatusTag s={b.status} /></span>
      </button>
    </li>
  );
}
