'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import Prep from './Prep';
import { loadDone } from '@/lib/draft';
import { fmtDate, fmtTime, tzAbbr } from '@/lib/time';
import { MODES } from '@/lib/settings';
import { downloadIcs } from '@/lib/ics';
import { T } from '@/lib/copy';

export default function Success() {
  const [done, setDone] = useState(undefined);
  useEffect(() => { setDone(loadDone()); }, []);
  const b = done?.booking;
  return (
    <main className="flow" style={{ paddingBottom: 40 }}>
      <div className="done-head">
        <div className="mark" aria-hidden="true">✓</div>
        <h1>{T.doneTitle}</h1>
        <p>{T.doneSub}</p>
      </div>
      {b && (
        <>
          <dl className="summary" style={{ marginTop: 24 }}>
            <div><dt>일시</dt><dd>{fmtDate(b.start)}<small>{fmtTime(b.start)} – {fmtTime(b.end)} ({tzAbbr(b.start)} · 로스앤젤레스 시간)</small></dd></div>
            <div><dt>만남 방식</dt><dd>{MODES[b.mode]?.label}<small>{b.placeText}</small></dd></div>
            {b.meetUrl && <div><dt>온라인 링크</dt><dd><a href={b.meetUrl} target="_blank" rel="noreferrer">{b.meetUrl}</a></dd></div>}
            <div><dt>신청 번호</dt><dd>{b.ref}</dd></div>
          </dl>
          <div className="note" style={{ marginTop: 18 }}>
            <b>{done.email}</b>로 확정 메일을 보냈어요. 메일에 있는 <b>예약 관리 링크</b>에서 언제든 일정을 바꾸거나 취소할 수 있어요. 메일이 안 보이면 스팸함도 확인해 주세요.
          </div>
          <div style={{ display: 'grid', gap: 8, marginTop: 16 }}>
            <button className="btn block" onClick={() => downloadIcs(b)}>내 캘린더에 추가</button>
            {done.manageUrl && <a className="btn ghost block" href={done.manageUrl}>예약 변경 · 취소</a>}
          </div>
        </>
      )}
      {done === null && <p className="note" style={{ marginTop: 20 }}>예약 내용은 확정 메일에서 확인하실 수 있어요.</p>}
      <div style={{ marginTop: 8 }}><Prep /></div>
      <p style={{ marginTop: 28 }}><Link className="link" href="/">처음으로</Link></p>
    </main>
  );
}
