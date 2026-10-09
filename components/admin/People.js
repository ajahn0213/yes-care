'use client';
import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/adminApi';
import { localParts, fmtTime } from '@/lib/time';
import BookingDrawer, { StatusTag } from './BookingDrawer';
import { useToast } from './common';

const day = (iso) => (iso ? localParts(iso).date.replace(/-/g, '.') : '');

export default function People() {
  const [data, setData] = useState(null);
  const [q, setQ] = useState('');
  const [only, setOnly] = useState(false);
  const [expand, setExpand] = useState(null);
  const [open, setOpen] = useState(null);
  const [toast, toastNode] = useToast();
  const load = useCallback(() => { api('/api/admin/people').then(setData).catch(() => {}); }, []);
  useEffect(load, [load]);
  const list = useMemo(() => (data?.people || []).filter((p) => (!only || p.followUp) && (!q.trim() || [p.name, p.email, p.group, p.phone].some((x) => (x || '').toLowerCase().includes(q.trim().toLowerCase())))), [data, q, only]);
  return (
    <>
      <div className="toolbar">
        <h1>심방 대상자</h1><span className="grow" />
        <label className="check" style={{ alignItems: 'center' }}><input type="checkbox" checked={only} onChange={(e) => setOnly(e.target.checked)} /><span>추후 연락 필요만</span></label>
        <input className="input" style={{ maxWidth: 240, minHeight: 40 }} placeholder="이름·이메일·소속 찾기" value={q} onChange={(e) => setQ(e.target.value)} aria-label="찾기" />
      </div>
      <p className="muted small">이메일(없으면 이름+전화번호)로 같은 사람을 묶었습니다. 이름을 누르면 심방 이력이 펼쳐집니다.</p>
      <div className="panel scroll-x">
        {!data ? <p className="empty">불러오는 중…</p> : list.length === 0 ? <p className="empty">{only ? '추후 연락이 필요한 사람이 없습니다.' : '아직 심방 기록이 없습니다.'}</p> : (
          <table className="tbl">
            <thead><tr><th>이름</th><th>소속</th><th>완료</th><th>최근 심방</th><th>예정</th><th>후속</th></tr></thead>
            <tbody>
              {list.map((p) => (
                <Fragment key={p.key}>
                  <tr className="click" onClick={() => setExpand(expand === p.key ? null : p.key)} aria-expanded={expand === p.key}>
                    <td><b>{p.name}</b><div className="muted small">{p.email || p.phone}</div></td>
                    <td>{p.group || '–'}</td>
                    <td>{p.completed}회</td>
                    <td>{day(p.lastVisit) || '–'}</td>
                    <td>{p.upcoming ? `${day(p.upcoming)} ${fmtTime(p.upcoming)}` : '–'}</td>
                    <td>{p.followUp ? <span className="tag coral">추후 연락</span> : ''}{p.nextVisit ? <div className="small muted">다음: {p.nextVisit}</div> : null}</td>
                  </tr>
                  {expand === p.key && (
                    <tr><td colSpan={6} style={{ background: 'var(--tint)' }}>
                      <ul className="histo">
                        {[...p.visits].reverse().map((v) => (
                          <li key={v.id}><button className="link" onClick={() => setOpen(v.id)}>{day(v.start)} {fmtTime(v.start)}</button> <StatusTag s={v.status} />{v.hasMemo ? ' · 메모 있음' : ''}{v.followUp ? ' · 추후 연락' : ''}</li>
                        ))}
                      </ul>
                    </td></tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {open && <BookingDrawer id={open} onClose={() => setOpen(null)} onChanged={load} toast={toast} />}
      {toastNode}
    </>
  );
}
