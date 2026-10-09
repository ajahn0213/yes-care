'use client';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { api } from '@/lib/adminApi';
import { DOW_KO, localParts, fmtDateShort } from '@/lib/time';
import BookingDrawer from './BookingDrawer';
import { useToast } from './common';

const ORDER = [1, 2, 3, 4, 5, 6, 0];
const CAL_MSG = {
  connected: ['ok', 'Google 캘린더를 연결했습니다.'],
  denied: ['warn', '캘린더 연결을 취소했습니다.'],
  failed: ['bad', '캘린더를 연결하지 못했습니다.'],
};

export default function Settings() {
  const sp = useSearchParams();
  const [st, setSt] = useState(null);
  const [f, setF] = useState(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState('');
  const [sync, setSync] = useState(null);
  const [open, setOpen] = useState(null);
  const [toast, toastNode] = useToast();
  const [calTest, setCalTest] = useState(null);

  const apply = (j) => { setSt(j); setF(JSON.parse(JSON.stringify(j.settings))); };
  useEffect(() => { api('/api/admin/settings').then(apply).catch((e) => setErr(e.message)); }, []);
  if (!st || !f) return <p className="muted">{err || '불러오는 중…'}</p>;

  const dirty = JSON.stringify(f) !== JSON.stringify(st.settings);
  const set = (k, v) => setF({ ...f, [k]: v });
  const num = (k) => (e) => set(k, e.target.value === '' ? '' : Number(e.target.value));
  async function save() {
    setBusy('save'); setErr('');
    try { apply(await api('/api/admin/settings', { settings: f })); toast('설정을 저장했습니다'); }
    catch (e) { setErr(e.message); } finally { setBusy(''); }
  }
  async function run(key, fn) { setBusy(key); setErr(''); try { await fn(); } catch (e) { setErr(e.message); } finally { setBusy(''); } }
  const cal = st.calendar;
  const calMsg = CAL_MSG[sp.get('calendar')];

  return (
    <>
      <div className="toolbar"><h1>설정</h1><span className="grow" />
        <button className="btn small primary" disabled={!dirty || busy === 'save'} onClick={save}>{busy === 'save' ? '저장 중…' : dirty ? '설정 저장' : '저장됨'}</button>
      </div>
      {calMsg && <div className={'note ' + calMsg[0]}>{calMsg[1]} {sp.get('msg') || ''}</div>}
      {err && <div className="note bad" role="alert">{err}</div>}

      {/* Google 캘린더 */}
      <section className="panel" id="sync">
        <div className="panel-h"><h2>Google 캘린더 연결</h2></div>
        <div className="panel-b" style={{ display: 'grid', gap: 14 }}>
          <div className="status-line">
            <span className={'dot ' + (!cal.configured ? 'bad' : !cal.connected ? 'warn' : cal.status === 'expired' ? 'bad' : 'ok')} />
            <b>{!cal.configured ? 'Google 연동 설정(GOOGLE_CLIENT_ID/SECRET)이 없습니다' : !cal.connected ? '연결되지 않음 — 온라인 신청을 받을 수 없습니다' : cal.status === 'expired' ? '연결 만료 — 다시 연결해 주세요' : `${cal.email} 캘린더에 연결됨`}</b>
          </div>
          {cal.error && <div className="note bad">{cal.error}</div>}
          <p className="muted small">신청자에게는 가능한 시간만 보이고, 캘린더 일정의 제목이나 내용은 읽지 않습니다(바쁜 시간만 확인). 예약이 확정되면 이 캘린더에 ‘[YES 심방] 이름’ 일정이 비공개로 만들어집니다.</p>
          <div className="acts">
            {cal.configured && <a className="btn small primary" href="/api/auth/google?mode=connect">{cal.connected ? '다시 연결하기' : 'Google 캘린더 연결하기'}</a>}
            {cal.connected && <button className="btn small" disabled={!!busy} onClick={() => run('test', async () => { setCalTest(null); const j = await api('/api/admin/calendar', { action: 'test' }); setCalTest(j.message); })}>{busy === 'test' ? '확인 중…' : '연결 테스트'}</button>}
            {cal.connected && <button className="btn small" disabled={!!busy} onClick={() => run('check', async () => { setSync(null); setSync(await api('/api/admin/calendar', { action: 'check' })); })}>{busy === 'check' ? '점검 중…' : '동기화 점검'}</button>}
            {cal.connected && <button className="btn small danger" disabled={!!busy} onClick={() => { if (confirm('캘린더 연결을 끊을까요? 끊으면 온라인 신청을 받을 수 없습니다.')) run('dc', async () => { await api('/api/admin/calendar', { action: 'disconnect' }); apply(await api('/api/admin/settings')); }); }}>연결 끊기</button>}
          </div>
          {calTest && <div className="note ok">{calTest}</div>}
          {sync && (
            <div className={'note ' + (sync.issues.length ? 'warn' : 'ok')}>
              예정된 심방 {sync.checked}건을 확인했습니다. {sync.issues.length ? `맞지 않는 것이 ${sync.issues.length}건 있습니다.` : '모두 캘린더와 일치합니다.'}
              {sync.issues.length > 0 && <ul style={{ margin: '8px 0 0', paddingLeft: 18 }}>{sync.issues.map((i) => <li key={i.id}><button className="link" onClick={() => setOpen(i.id)}>{i.name} · {fmtDateShort(localParts(i.start).date)}</button> — {i.text}</li>)}</ul>}
            </div>
          )}
          {cal.connected && (
            <CalendarId current={cal.calendarId} onSave={(id) => run('cid', async () => { await api('/api/admin/calendar', { action: 'calendarId', calendarId: id }); apply(await api('/api/admin/settings')); toast('사용할 캘린더를 바꿨습니다'); })} />
          )}
        </div>
      </section>

      {/* 신청 받기 */}
      <section className="panel">
        <div className="panel-h"><h2>온라인 신청</h2></div>
        <div className="panel-b" style={{ display: 'grid', gap: 14 }}>
          <label className="check"><input type="checkbox" checked={f.open} onChange={(e) => set('open', e.target.checked)} /><span><b>온라인 신청 받기</b> — 끄면 신청 화면에 ‘잠시 쉬고 있어요’가 보입니다. (직접 등록은 계속 가능)</span></label>
          <label className="field" style={{ maxWidth: 320 }}>목회자 이름 (메일 서명)<input value={f.pastorName} onChange={(e) => set('pastorName', e.target.value)} /></label>
          <p className="small muted">신청 링크: <b>{st.env.appUrl}</b> — 카카오톡·문자로 보내 주세요.</p>
        </div>
      </section>

      {/* 요일별 시간 */}
      <section className="panel">
        <div className="panel-h"><h2>요일별 심방 가능 시간</h2></div>
        <div className="panel-b">
          <div className="week">
            {ORDER.map((d) => {
              const list = f.weekly[d] || [];
              const upd = (l) => set('weekly', { ...f.weekly, [d]: l });
              return (
                <div className="wrow" key={d}>
                  <span className="dn" style={{ color: d === 0 ? 'var(--red)' : undefined }}>{DOW_KO[d]}</span>
                  <div className="ranges">
                    {list.length === 0 && <span className="muted small">쉬는 날</span>}
                    {list.map((r, i) => (
                      <span className="range" key={i}>
                        <input type="time" step="900" value={r.start} aria-label={`${DOW_KO[d]}요일 시작`} onChange={(e) => upd(list.map((x, k) => (k === i ? { ...x, start: e.target.value } : x)))} />
                        <span>–</span>
                        <input type="time" step="900" value={r.end} aria-label={`${DOW_KO[d]}요일 끝`} onChange={(e) => upd(list.map((x, k) => (k === i ? { ...x, end: e.target.value } : x)))} />
                        <button aria-label="이 시간대 지우기" onClick={() => upd(list.filter((_, k) => k !== i))}>×</button>
                      </span>
                    ))}
                    <button className="link small" onClick={() => upd([...list, list.length ? { start: '19:00', end: '21:00' } : { start: '10:00', end: '18:00' }])}>+ 시간대</button>
                  </div>
                </div>
              );
            })}
          </div>
          <p className="muted small" style={{ marginTop: 10 }}>점심시간처럼 비우고 싶은 때는 시간대를 둘로 나눠 주세요 (예: 10:00–12:00, 13:30–18:00). 캘린더에 이미 있는 일정 시간은 자동으로 빠집니다.</p>
        </div>
      </section>

      {/* 휴무일 */}
      <section className="panel">
        <div className="panel-h"><h2>신청 받지 않는 날</h2></div>
        <div className="panel-b" style={{ display: 'grid', gap: 12 }}>
          <Blackout onAdd={(b) => set('blackouts', [...f.blackouts.filter((x) => x.date !== b.date), b].sort((a, c) => a.date.localeCompare(c.date)))} />
          <div className="chips">
            {f.blackouts.length === 0 && <span className="muted small">없음</span>}
            {f.blackouts.map((b) => <span className="chip" key={b.date}>{fmtDateShort(b.date)}{b.note ? ' · ' + b.note : ''}<button aria-label="지우기" onClick={() => set('blackouts', f.blackouts.filter((x) => x.date !== b.date))}>×</button></span>)}
          </div>
        </div>
      </section>

      {/* 규칙 */}
      <section className="panel">
        <div className="panel-h"><h2>예약 규칙</h2></div>
        <div className="panel-b" style={{ display: 'grid', gap: 12 }}>
          <div className="nums">
            <label className="field">심방 시간 (분)<input type="number" min="15" max="240" step="15" value={f.durationMin} onChange={num('durationMin')} /></label>
            <label className="field">시간 선택 간격 (분)<input type="number" min="15" max="240" step="15" value={f.stepMin} onChange={num('stepMin')} /></label>
            <label className="field">최소 사전 신청 (시간)<input type="number" min="0" max="336" value={f.minNoticeHours} onChange={num('minNoticeHours')} /></label>
            <label className="field">예약 가능 범위 (일)<input type="number" min="1" max="180" value={f.horizonDays} onChange={num('horizonDays')} /></label>
            <label className="field">하루 최대 심방 (건)<input type="number" min="1" max="20" value={f.maxPerDay} onChange={num('maxPerDay')} /></label>
            <label className="field">심방 사이 준비·이동 시간 (분)<input type="number" min="0" max="180" step="5" value={f.bufferMin} onChange={num('bufferMin')} /></label>
          </div>
          <p className="muted small">준비 시간은 캘린더의 다른 일정 앞뒤에도 적용됩니다. 예: 간격 60분 · 준비 15분이면 10시 심방 뒤에는 12시부터 신청할 수 있어요. 연달아 받으려면 간격을 75분으로 바꾸세요.</p>
        </div>
      </section>

      {/* 장소·초대 */}
      <section className="panel">
        <div className="panel-h"><h2>장소와 초대</h2></div>
        <div className="panel-b" style={{ display: 'grid', gap: 12 }}>
          <label className="field">‘교회에서 만나요’ 기본 장소<input value={f.churchPlace} onChange={(e) => set('churchPlace', e.target.value)} /></label>
          <label className="check"><input type="checkbox" checked={f.meetLinks} onChange={(e) => set('meetLinks', e.target.checked)} /><span>온라인 심방에 Google Meet 링크 자동 만들기</span></label>
          <label className="check"><input type="checkbox" checked={f.inviteApplicant} onChange={(e) => set('inviteApplicant', e.target.checked)} /><span>신청자에게 Google 캘린더 초대장도 보내기 (변경·취소도 함께 반영)</span></label>
          <label className="field">함께 확인할 다른 캘린더 ID<span className="opt">(선택, 쉼표로 구분)</span>
            <input value={f.busyCalendars.join(', ')} onChange={(e) => set('busyCalendars', e.target.value.split(',').map((x) => x.trim()).filter(Boolean))} placeholder="예: 가족 캘린더, 교회 사역 캘린더 ID" />
            <span className="help">이 캘린더들의 바쁜 시간도 신청 시간에서 뺍니다. Google 캘린더 설정 → 캘린더 통합 → 캘린더 ID.</span>
          </label>
        </div>
      </section>

      {/* 메일 */}
      <section className="panel">
        <div className="panel-h"><h2>알림 메일</h2></div>
        <div className="panel-b" style={{ display: 'grid', gap: 12 }}>
          <div className="status-line"><span className={'dot ' + (st.mail.ready ? 'ok' : 'warn')} /><b>{st.mail.ready ? `${st.mail.from}에서 보냄` : '메일 설정 없음 (GMAIL_USER, GMAIL_APP_PASSWORD)'}</b></div>
          <label className="field">새 예약·변경·취소 알림 받을 이메일<span className="opt">(쉼표로 구분, 비우면 관리자 이메일)</span>
            <input value={f.notifyEmails.join(', ')} onChange={(e) => set('notifyEmails', e.target.value.split(',').map((x) => x.trim()).filter(Boolean))} placeholder={st.env.adminEmails.join(', ')} />
          </label>
          <p className="muted small">신청자가 적은 기도 제목·나눌 이야기와 목양 메모는 어떤 메일에도 넣지 않습니다. 매일 아침 내일 심방이 있으면 신청자에게 안내 메일, 목회자에게 일정 요약을 보냅니다{st.env.cron ? '' : ' (CRON_SECRET 설정 필요)'}.</p>
          {st.mail.ready && <div><button className="btn small" disabled={!!busy} onClick={() => run('mail', async () => { const j = await api('/api/admin/test-mail', {}); toast('테스트 메일을 보냈습니다: ' + j.to.join(', ')); })}>{busy === 'mail' ? '보내는 중…' : '테스트 메일 보내기'}</button></div>}
        </div>
      </section>

      {/* 보관 */}
      <section className="panel">
        <div className="panel-h"><h2>개인정보 보관</h2></div>
        <div className="panel-b" style={{ display: 'grid', gap: 12 }}>
          <label className="field" style={{ maxWidth: 260 }}>심방 기록 보관 기간 (개월)<input type="number" min="3" max="120" value={f.retentionMonths} onChange={num('retentionMonths')} /></label>
          <p className="muted small">보관 기간이 지난 예약 정보와 목양 메모는 아래 버튼으로 한꺼번에 영구 삭제합니다. 한 사람의 기록만 지우려면 예약을 열어 ‘기록 영구 삭제’를 누르세요.</p>
          <div><button className="btn small danger" disabled={!!busy} onClick={() => run('purge', async () => {
            const d = await api('/api/admin/purge', { dryRun: true });
            if (!d.count) { toast(`${d.months}개월이 지난 기록이 없습니다`); return; }
            if (!confirm(`${d.months}개월이 지난 심방 기록 ${d.count}건을 영구 삭제할까요?`)) return;
            const r = await api('/api/admin/purge', {}); toast(`${r.count}건을 삭제했습니다`);
          })}>보관 기간 지난 기록 삭제</button></div>
        </div>
      </section>

      {/* 점검 */}
      <section className="panel">
        <div className="panel-h"><h2>설치 점검</h2></div>
        <div className="panel-b">
          <ul className="histo" style={{ fontSize: 14 }}>
            <li><span className={'dot ' + (st.env.adminEmails.length ? 'ok' : 'bad')} /> 관리자 이메일(ADMIN_EMAILS): {st.env.adminEmails.join(', ') || '없음'}</li>
            <li><span className={'dot ' + (cal.configured ? 'ok' : 'bad')} /> Google 로그인·캘린더 앱(GOOGLE_CLIENT_ID/SECRET)</li>
            <li><span className={'dot ' + (st.mail.ready ? 'ok' : 'warn')} /> Gmail 발송(GMAIL_USER/GMAIL_APP_PASSWORD)</li>
            <li><span className={'dot ' + (st.env.sessionSecret ? 'ok' : 'warn')} /> SESSION_SECRET {st.env.sessionSecret ? '' : '(없으면 다른 비밀 값으로 대신 — 넣어 두기를 권장)'}</li>
            <li><span className={'dot ' + (st.env.cron ? 'ok' : 'warn')} /> 하루 전 안내 메일(CRON_SECRET)</li>
            <li><span className={'dot ' + (st.env.passwordLogin ? 'warn' : 'ok')} /> 비상용 비밀번호 로그인 {st.env.passwordLogin ? '켜짐 (ADMIN_PASSWORD)' : '꺼짐'}</li>
          </ul>
          {st.log.length > 0 && (
            <details style={{ marginTop: 14 }}>
              <summary className="small"><b>최근 운영 기록 {st.log.length}건</b> (메일·캘린더 오류 등)</summary>
              <ul className="histo" style={{ marginTop: 8 }}>{st.log.map((l, i) => <li key={i}><time>{localParts(l.at).date.slice(5)} {localParts(l.at).time}</time>{l.msg}</li>)}</ul>
            </details>
          )}
        </div>
      </section>

      {dirty && <div className="toast" style={{ background: 'var(--paper)', color: 'var(--ink)', border: '1.5px solid var(--ink)', display: 'flex', gap: 12, alignItems: 'center' }}>바뀐 설정이 있습니다 <button className="btn small primary" onClick={save} disabled={busy === 'save'}>저장</button></div>}
      {open && <BookingDrawer id={open} onClose={() => setOpen(null)} toast={toast} />}
      {toastNode}
    </>
  );
}

function Blackout({ onAdd }) {
  const [date, setDate] = useState('');
  const [note, setNote] = useState('');
  return (
    <div className="row" style={{ maxWidth: 560 }}>
      <label className="field">날짜<input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>
      <label className="field">메모<span className="opt">(선택)</span><input value={note} onChange={(e) => setNote(e.target.value)} placeholder="예: 수련회, 휴가" maxLength={60} /></label>
      <button className="btn small" style={{ flex: '0 0 auto', minHeight: 50 }} disabled={!date} onClick={() => { onAdd({ date, note }); setDate(''); setNote(''); }}>추가</button>
    </div>
  );
}

function CalendarId({ current, onSave }) {
  const [v, setV] = useState(current || 'primary');
  return (
    <details>
      <summary className="small"><b>심방 일정을 넣을 캘린더</b> — 지금: {current === 'primary' ? '기본 캘린더' : current}</summary>
      <div className="row" style={{ marginTop: 10, maxWidth: 560 }}>
        <label className="field">캘린더 ID<input value={v} onChange={(e) => setV(e.target.value)} /></label>
        <button className="btn small" style={{ flex: '0 0 auto', minHeight: 50 }} onClick={() => onSave(v)}>바꾸기</button>
      </div>
      <p className="muted small">기본(primary)을 그대로 쓰시면 됩니다. 심방 전용 캘린더를 따로 쓰려면 그 캘린더의 ID를 넣으세요.</p>
    </details>
  );
}
