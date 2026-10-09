'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/adminApi';
import { fmtDate, fmtTime, tzAbbr, localParts } from '@/lib/time';
import { MODES, STATUS } from '@/lib/settings';

export const StatusTag = ({ s }) => <span className={'tag ' + (STATUS[s]?.tone || 'muted')}>{STATUS[s]?.label || s}</span>;
export const CalTag = ({ c, status }) => {
  if (status === 'cancelled') return null;
  if (!c || c.status === 'synced' || c.status === 'deleted') return null;
  const t = { error: ['bad', '캘린더 오류'], missing: ['bad', '캘린더에서 삭제됨'], moved: ['warn', '캘린더 시간 다름'], none: ['warn', '캘린더 없음'] }[c.status] || ['warn', '캘린더 확인'];
  return <span className={'tag ' + t[0]}>{t[1]}</span>;
};
const placeOf = (b, s) => (b.mode === 'online' ? (b.meetUrl ? '온라인 · Google Meet' : '온라인') : b.mode === 'church' ? (b.place ? '교회 · ' + b.place : '교회') : b.place || '장소 추후 협의');
const at = (iso) => { const p = localParts(iso); return `${p.date.slice(5).replace('-', '/')} ${p.time}`; };

export default function BookingDrawer({ id, onClose, onChanged, toast }) {
  const [b, setB] = useState(null);
  const [note, setNote] = useState(null);
  const [err, setErr] = useState('');
  const [form, setForm] = useState(''); // move | cancel | edit
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setB(null); setNote(null); setErr(''); setForm('');
    api('/api/admin/bookings?id=' + encodeURIComponent(id)).then((j) => setB(j.booking)).catch((e) => setErr(e.message));
    api('/api/admin/notes?id=' + encodeURIComponent(id)).then((j) => setNote(j.note)).catch(() => {});
  }, [id]);
  useEffect(() => {
    const k = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k);
  }, [onClose]);

  async function act(body, okMsg) {
    setBusy(true); setErr('');
    try {
      const j = await api('/api/admin/bookings', { id, ...body });
      if (j.booking) setB(j.booking);
      setForm('');
      toast?.(okMsg || '저장했습니다');
      onChanged?.();
      return j;
    } catch (e) { setErr(e.message); return null; }
    finally { setBusy(false); }
  }
  async function fix(kind) {
    setBusy(true); setErr('');
    try { const j = await api('/api/admin/calendar', { action: 'fix', id, fix: kind }); setB(j.booking); toast?.('캘린더와 맞췄습니다'); onChanged?.(); }
    catch (e) { setErr(e.message); } finally { setBusy(false); }
  }

  return (
    <div className="drawer-bg" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <aside className="drawer" role="dialog" aria-modal="true" aria-label="심방 예약 자세히">
        <div className="drawer-h">
          <h2>{b ? b.name : '불러오는 중…'}</h2>
          {b && <StatusTag s={b.status} />}
          <button className="x" onClick={onClose} aria-label="닫기">×</button>
        </div>
        {!b ? <div className="drawer-b">{err ? <div className="note bad">{err}</div> : <p className="muted">불러오는 중…</p>}</div> : (
          <div className="drawer-b">
            {err && <div className="note bad" role="alert">{err}</div>}
            <div className="dsec">
              <dl className="kv">
                <dt>일시</dt><dd>{fmtDate(b.start)}{'\n'}{fmtTime(b.start)} – {fmtTime(b.end)} <span className="muted">({tzAbbr(b.start)})</span></dd>
                <dt>만남 방식</dt><dd>{MODES[b.mode]?.label}{'\n'}<span className="muted">{placeOf(b)}</span></dd>
                {b.meetUrl && <><dt>Meet</dt><dd><a href={b.meetUrl} target="_blank" rel="noreferrer">{b.meetUrl}</a></dd></>}
                <dt>연락처</dt><dd>{b.email ? <a href={'mailto:' + b.email}>{b.email}</a> : <span className="muted">이메일 없음</span>}{b.phone ? <>{'\n'}<a href={'tel:' + b.phone}>{b.phone}</a> · <a href={'sms:' + b.phone}>문자</a></> : ''}</dd>
                {b.group && <><dt>소속</dt><dd>{b.group}</dd></>}
                <dt>신청</dt><dd>{b.source === 'admin' ? '목회자가 직접 등록' : '온라인 신청'} · {b.ref}{'\n'}<span className="muted">{at(b.createdAt)} 접수</span></dd>
              </dl>
            </div>

            {(b.topics || b.prayer) && (
              <div className="dsec">
                <h3>신청자가 적은 내용</h3>
                <dl className="kv">
                  {b.topics && <><dt>나눌 이야기</dt><dd>{b.topics}</dd></>}
                  {b.prayer && <><dt>기도 제목</dt><dd>{b.prayer}</dd></>}
                </dl>
              </div>
            )}

            {b.status === 'confirmed' && b.calendar && b.calendar.status !== 'synced' && (
              <div className="note warn">
                <b>캘린더 확인이 필요합니다.</b> {b.calendar.error}
                <div className="acts" style={{ marginTop: 10 }}>
                  {['none', 'error', 'missing'].includes(b.calendar.status) && <button className="btn small" disabled={busy} onClick={() => fix('recreate')}>캘린더에 다시 만들기</button>}
                  {b.calendar.status === 'moved' && <><button className="btn small" disabled={busy} onClick={() => fix('adoptCalendar')}>캘린더 시간으로 앱 맞추기</button><button className="btn small" disabled={busy} onClick={() => fix('pushApp')}>캘린더를 앱 시간으로 되돌리기</button></>}
                  {b.calendar.status === 'missing' && <button className="btn small danger" disabled={busy} onClick={() => act({ action: 'cancel', reason: '캘린더에서 삭제됨', notify: false }, '취소로 처리했습니다')}>이 예약을 취소로 처리</button>}
                </div>
              </div>
            )}

            <div className="dsec">
              <h3>관리</h3>
              <div className="acts">
                {b.status === 'confirmed' && <>
                  <button className="btn small primary" disabled={busy} onClick={() => act({ action: 'status', status: 'completed' }, '심방 완료로 표시했습니다')}>심방 완료</button>
                  <button className="btn small" disabled={busy} onClick={() => act({ action: 'status', status: 'noshow' }, '미진행으로 표시했습니다')}>미진행</button>
                  <button className="btn small" onClick={() => setForm(form === 'move' ? '' : 'move')}>일정 변경</button>
                  <button className="btn small" onClick={() => setForm(form === 'edit' ? '' : 'edit')}>정보 수정</button>
                  {b.email && <button className="btn small" disabled={busy} onClick={() => act({ action: 'resend' }, '확정 메일을 다시 보냈습니다')}>확정 메일 다시 보내기</button>}
                  <button className="btn small danger" onClick={() => setForm(form === 'cancel' ? '' : 'cancel')}>취소</button>
                </>}
                {(b.status === 'completed' || b.status === 'noshow') && <button className="btn small" disabled={busy} onClick={() => act({ action: 'status', status: 'confirmed' }, '예약 확정으로 되돌렸습니다')}>예약 확정으로 되돌리기</button>}
                {(b.status !== 'confirmed' || Date.parse(b.end) < Date.now()) && (
                  <button className="btn small danger" disabled={busy} onClick={async () => { if (confirm('이 심방 기록과 목양 메모를 영구 삭제할까요? 되돌릴 수 없습니다.')) { const j = await act({ action: 'delete' }, '삭제했습니다'); if (j) onClose(); } }}>기록 영구 삭제</button>
                )}
              </div>
              {form === 'move' && <MoveForm b={b} busy={busy} onSubmit={(v) => act({ action: 'reschedule', ...v }, '일정을 바꿨습니다')} />}
              {form === 'cancel' && <CancelForm b={b} busy={busy} onSubmit={(v) => act({ action: 'cancel', ...v }, '취소했습니다')} />}
              {form === 'edit' && <EditForm b={b} busy={busy} onSubmit={(patch) => act({ action: 'update', patch }, '수정했습니다')} />}
            </div>

            <PrivateNote id={id} note={note} setNote={setNote} toast={toast} onChanged={onChanged} />

            <div className="dsec">
              <h3>기록</h3>
              <ul className="histo">
                {(b.history || []).map((h, i) => <li key={i}><time>{at(h.at)}</time>{h.what}</li>)}
                {(b.mail || []).map((m, i) => <li key={'m' + i}><time>{at(m.at)}</time>{m.to === 'admin' ? '목회자 알림' : '신청자'} 메일 ({{ confirmed: '확정', rescheduled: '변경', cancelled: '취소', reminder: '하루 전 안내', created: '새 예약' }[m.kind] || m.kind}) {m.ok ? '보냄' : <b style={{ color: 'var(--red)' }}>실패 · {m.error}</b>}</li>)}
              </ul>
              {b.calendar?.htmlLink && b.status === 'confirmed' && <p className="small" style={{ marginTop: 8 }}><a href={b.calendar.htmlLink} target="_blank" rel="noreferrer">Google 캘린더에서 보기</a></p>}
            </div>
          </div>
        )}
      </aside>
    </div>
  );
}

function MoveForm({ b, busy, onSubmit }) {
  const p = localParts(b.start);
  const [date, setDate] = useState(p.date);
  const [time, setTime] = useState(p.time);
  const [force, setForce] = useState(false);
  const [notify, setNotify] = useState(!!b.email);
  return (
    <div className="subform" style={{ marginTop: 12 }}>
      <div className="row">
        <label className="field">날짜<input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>
        <label className="field">시작 시간<input type="time" step="900" value={time} onChange={(e) => setTime(e.target.value)} /></label>
      </div>
      <label className="check"><input type="checkbox" checked={force} onChange={(e) => setForce(e.target.checked)} /><span>가능 시간 규칙이나 다른 일정과 겹쳐도 바꾸기</span></label>
      {b.email && <label className="check"><input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} /><span>신청자에게 변경 메일 보내기</span></label>}
      <button className="btn primary" disabled={busy || !date || !time} onClick={() => onSubmit({ date, time, force, notify })}>이 시간으로 바꾸기</button>
    </div>
  );
}
function CancelForm({ b, busy, onSubmit }) {
  const [reason, setReason] = useState('');
  const [notify, setNotify] = useState(!!b.email);
  return (
    <div className="subform" style={{ marginTop: 12 }}>
      <label className="field">취소 사유<span className="opt">(기록용, 메일에는 넣지 않음)</span><input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} /></label>
      {b.email && <label className="check"><input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} /><span>신청자에게 취소 메일 보내기</span></label>}
      <p className="small muted">Google 캘린더의 일정도 함께 지워집니다.</p>
      <button className="btn danger primary" disabled={busy} onClick={() => onSubmit({ reason, notify })}>심방 취소하기</button>
    </div>
  );
}
export function EditForm({ b, busy, onSubmit, submitLabel = '수정 저장' }) {
  const [f, setF] = useState({ name: b.name || '', email: b.email || '', phone: b.phone || '', group: b.group || '', mode: b.mode || 'church', place: b.place || '', topics: b.topics || '', prayer: b.prayer || '' });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  return (
    <div className="subform" style={{ marginTop: 12 }}>
      <div className="row">
        <label className="field">이름<input value={f.name} onChange={set('name')} /></label>
        <label className="field">소속<input value={f.group} onChange={set('group')} /></label>
      </div>
      <div className="row">
        <label className="field">이메일<input type="email" value={f.email} onChange={set('email')} /></label>
        <label className="field">휴대전화<input value={f.phone} onChange={set('phone')} /></label>
      </div>
      <div className="row">
        <label className="field">만남 방식<select value={f.mode} onChange={set('mode')}>{Object.entries(MODES).map(([k, m]) => <option key={k} value={k}>{m.label}</option>)}</select></label>
        {f.mode !== 'online' && <label className="field">장소<input value={f.place} onChange={set('place')} placeholder={f.mode === 'outside' ? '비우면 장소 추후 협의' : '교회 안 장소 (선택)'} /></label>}
      </div>
      <label className="field">나눌 이야기<textarea value={f.topics} onChange={set('topics')} /></label>
      <label className="field">기도 제목<textarea value={f.prayer} onChange={set('prayer')} /></label>
      <button className="btn primary" disabled={busy || !f.name.trim()} onClick={() => onSubmit(f)}>{submitLabel}</button>
    </div>
  );
}

function PrivateNote({ id, note, setNote, toast, onChanged }) {
  const [f, setF] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (note) setF({ memo: note.memo || '', followUp: !!note.followUp, nextVisit: note.nextVisit || '' }); }, [note]);
  if (!f) return null;
  const dirty = f.memo !== (note.memo || '') || f.followUp !== !!note.followUp || f.nextVisit !== (note.nextVisit || '');
  async function save() {
    setBusy(true);
    try { const j = await api('/api/admin/notes', { id, ...f }); setNote(j.note); toast?.('목양 메모를 저장했습니다'); onChanged?.(); }
    catch (e) { alert(e.message); } finally { setBusy(false); }
  }
  return (
    <div className="dsec">
      <div className="private">
        <h3 style={{ margin: 0 }}>비공개 목양 메모</h3>
        <p className="lock">관리자만 볼 수 있어요. 메일·캘린더·신청자 화면 어디에도 나가지 않습니다.</p>
        <label className="field">메모<textarea value={f.memo} onChange={(e) => setF({ ...f, memo: e.target.value })} maxLength={5000} placeholder="함께 나눈 이야기, 기도할 것, 다음에 기억할 것" /></label>
        <label className="check"><input type="checkbox" checked={f.followUp} onChange={(e) => setF({ ...f, followUp: e.target.checked })} /><span>추후 연락이 필요해요</span></label>
        <label className="field">다음 심방<span className="opt">(선택)</span><input value={f.nextVisit} onChange={(e) => setF({ ...f, nextVisit: e.target.value })} placeholder="예: 12월 초, 시험 끝나고" maxLength={60} /></label>
        <div><button className="btn small primary" disabled={!dirty || busy} onClick={save}>메모 저장</button></div>
      </div>
    </div>
  );
}
