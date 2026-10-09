// 예약 만들기·바꾸기·취소 + Google Calendar 동기화 — 서버 전용
// 원칙: 캘린더에 일정이 만들어지지 않으면 예약을 확정하지 않습니다.
import { getSettings, listBookings, putBooking, getBooking, issueManageToken, withLock, addLog } from './store';
import { connectionInfo, freeBusy, createEvent, patchEvent, deleteEvent, getEvent, meetUrlOf, CalendarError } from './google';
import { computeSlots, isSlotOpen, ACTIVE } from './slots';
import { zonedToUtc, addDays, localParts, fmtDate, fmtTime } from './time';
import { MODES, placeText } from './settings';
import { applicantMail, adminMail, sendMail, mailReady } from './mail';
import { encrypt, decrypt, randomToken, refCode } from './secure';

export class BookingError extends Error {
  constructor(message, status = 400, code = '') { super(message); this.status = status; this.code = code; }
}

const dayBounds = (from, to) => ({ s: zonedToUtc(from, '00:00'), e: zonedToUtc(addDays(to, 1), '00:00') });

// 캘린더가 예약을 받을 수 있는 상태인지
export async function calendarReady() {
  const c = await connectionInfo();
  if (!c.configured || !c.connected) return { ok: false, reason: 'calendar', message: '목사님의 캘린더 연결을 준비하고 있어요.' };
  if (c.status === 'expired') return { ok: false, reason: 'calendar', message: '목사님의 캘린더 연결을 다시 확인하고 있어요.' };
  return { ok: true };
}

// 신청자에게 보여 줄 가능 시간 (바쁜 일정의 내용은 절대 내보내지 않음)
export async function availability({ from, to, exclude } = {}) {
  const settings = await getSettings();
  if (!settings.open) return { ready: false, reason: 'closed', message: '지금은 온라인 심방 신청을 잠시 쉬고 있어요.', settings };
  const ready = await calendarReady();
  if (!ready.ok) return { ready: false, reason: ready.reason, message: ready.message, settings };
  const nowMs = Date.now();
  const today = localParts(nowMs).date;
  const f = from && from > today ? from : today;
  const t = to || addDays(today, settings.horizonDays);
  if (f > t) return { ready: true, days: {}, settings };
  const { s, e } = dayBounds(f, t);
  const [bookings, busyRaw] = await Promise.all([listBookings(s - 864e5, e + 864e5), freeBusy(new Date(s).toISOString(), new Date(e).toISOString(), settings.busyCalendars)]);
  // 일정을 옮길 때는 자기 자신의 기존 일정(캘린더에도 있음)은 바쁜 시간에서 뺌
  const busy = exclude ? busyRaw.filter((x) => !(x.start === Date.parse(exclude.start) && x.end === Date.parse(exclude.end))) : busyRaw;
  const days = computeSlots({ settings, busy, bookings, nowMs, from: f, to: t, excludeId: exclude?.id });
  return { ready: true, days, settings, bookings, busy };
}

function eventBody(b, settings, appUrl) {
  const lines = [
    'YES 심방 · YES Pastoral Care',
    `신청자: ${b.name}${b.group ? ' · ' + b.group : ''}`,
    `만남 방식: ${MODES[b.mode]?.label || ''}`,
    `장소: ${placeText(b, settings)}`,
    `신청 번호: ${b.ref}`,
    '',
    `관리: ${appUrl}/admin/bookings?id=${b.id}`,
  ];
  return {
    summary: `[YES 심방] ${b.name}`,
    description: lines.join('\n'), // 기도 제목·나눌 내용·목양 메모는 넣지 않음
    location: b.mode === 'online' ? '' : placeText(b, settings),
    start: { dateTime: b.start, timeZone: 'America/Los_Angeles' },
    end: { dateTime: b.end, timeZone: 'America/Los_Angeles' },
    visibility: 'private',
    extendedProperties: { private: { yesCareId: b.id } },
    ...(settings.inviteApplicant && b.email ? { attendees: [{ email: b.email, displayName: b.name }] } : {}),
  };
}
const meetRequest = (b) => ({ conferenceData: { createRequest: { requestId: 'yc-' + b.id + '-' + Date.now().toString(36), conferenceSolutionKey: { type: 'hangoutsMeet' } } } });

async function createCalendarEvent(b, settings, appUrl) {
  const meet = b.mode === 'online' && settings.meetLinks;
  const ev = await createEvent({ ...eventBody(b, settings, appUrl), ...(meet ? meetRequest(b) : {}) }, { meet, notify: settings.inviteApplicant });
  b.calendar = { eventId: ev.id, status: 'synced', error: '', htmlLink: ev.htmlLink || '', syncedAt: new Date().toISOString() };
  b.meetUrl = meetUrlOf(ev) || '';
  return ev;
}

function newBooking(input, startIso, settings, source) {
  const start = new Date(startIso).toISOString();
  const end = new Date(Date.parse(start) + settings.durationMin * 60000).toISOString();
  const lp = localParts(start);
  return {
    id: 'b' + randomToken(9).replace(/[-_]/g, 'x'), ref: refCode(), status: 'confirmed', source,
    start, end, date: lp.date, time: lp.time, durationMin: settings.durationMin,
    name: input.name, email: input.email, phone: input.phone || '', group: input.group || '',
    mode: input.mode, place: input.place || '', topics: input.topics || '', prayer: input.prayer || '',
    meetUrl: '', calendar: { eventId: '', status: 'none', error: '' },
    history: [{ at: new Date().toISOString(), what: source === 'admin' ? '목회자가 직접 등록' : '온라인 신청' }],
    mail: [], reminded: false, createdAt: new Date().toISOString(),
  };
}

// ---------- 신청자: 예약 확정
export async function bookPublic(input, startIso, { appUrl }) {
  return withLock(async () => {
    const settings = await getSettings();
    if (!settings.open) throw new BookingError('지금은 온라인 심방 신청을 잠시 쉬고 있어요.', 409, 'closed');
    const ready = await calendarReady();
    if (!ready.ok) throw new BookingError('지금은 예약을 확정할 수 없어요. ' + ready.message + ' 잠시 후 다시 시도하시거나 목사님께 직접 연락해 주세요.', 503, 'calendar');
    const d = localParts(startIso).date;
    const { s, e } = dayBounds(d, d);
    let bookings, busy;
    try {
      [bookings, busy] = await Promise.all([listBookings(s - 864e5, e + 864e5), freeBusy(new Date(s).toISOString(), new Date(e).toISOString(), settings.busyCalendars)]);
    } catch (err) {
      throw new BookingError('목사님 일정을 확인하지 못해 예약을 확정하지 못했어요. 잠시 후 다시 시도해 주세요.', 503, 'calendar');
    }
    // 같은 사람이 이미 잡아 둔 앞으로의 예약이 너무 많으면 막음 (반복 신청 방지)
    const now = Date.now();
    const all = await listBookings(now, now + 400 * 864e5);
    const mine = all.filter((b) => ACTIVE(b) && b.email === input.email);
    if (mine.some((b) => b.start === new Date(startIso).toISOString())) throw new BookingError('이미 같은 시간에 신청하셨어요. 받은 메일의 예약 관리 링크를 확인해 주세요.', 409, 'dup');
    if (mine.length >= 2) throw new BookingError('이미 예정된 심방이 있어요. 받은 메일의 예약 관리 링크에서 일정을 바꾸거나, 목사님께 직접 연락해 주세요.', 409, 'limit');
    if (!isSlotOpen({ settings, busy, bookings, nowMs: now }, startIso)) {
      throw new BookingError('방금 다른 분이 이 시간을 신청했거나, 더 이상 가능하지 않은 시간이에요. 다른 시간을 골라 주세요.', 409, 'taken');
    }
    const b = newBooking(input, startIso, settings, 'web');
    const tok = await issueManageToken(b.id);
    b.tokenHash = tok.hash; b.tokenEnc = encrypt(tok.token);
    let ev;
    try {
      ev = await createCalendarEvent(b, settings, appUrl);
    } catch (err) {
      await addLog('calendar', '예약 확정 중 캘린더 일정 생성 실패: ' + err.message);
      throw new BookingError('목사님 캘린더에 일정을 만들지 못해 예약이 확정되지 않았어요. 잠시 후 다시 시도해 주세요.', 503, 'calendar');
    }
    try {
      await putBooking(b);
    } catch (err) {
      try { await deleteEvent(ev.id, { notify: false }); } catch {}
      await addLog('store', '예약 저장 실패 — 만든 캘린더 일정을 되돌림');
      throw new BookingError('예약을 저장하지 못해 확정되지 않았어요. 잠시 후 다시 시도해 주세요.', 503, 'store');
    }
    return { booking: b, token: tok.token };
  });
}

// ---------- 신청자/관리자: 일정 변경
export async function reschedule(id, newStartIso, { by, appUrl, force }) {
  return withLock(async () => {
    const settings = await getSettings();
    const b = await getBooking(id);
    if (!b || b.status !== 'confirmed') throw new BookingError('변경할 수 있는 예약이 아닙니다.', 409);
    const newStart = new Date(newStartIso).toISOString();
    if (newStart === b.start) throw new BookingError('지금과 같은 시간이에요.', 400);
    if (!force) {
      const d = localParts(newStart).date;
      let av;
      try { av = await availability({ from: d, to: d, exclude: b }); } catch { throw new BookingError('목사님 일정을 확인하지 못했어요. 잠시 후 다시 시도해 주세요.', 503, 'calendar'); }
      if (!av.ready) throw new BookingError('지금은 일정을 바꿀 수 없어요. ' + av.message, 503, 'calendar');
      if (!av.days[d]?.some((x) => x.start === newStart)) throw new BookingError('방금 다른 분이 이 시간을 신청했거나, 더 이상 가능하지 않은 시간이에요. 다른 시간을 골라 주세요.', 409, 'taken');
    }
    const old = { start: b.start, end: b.end };
    const end = new Date(Date.parse(newStart) + (b.durationMin || settings.durationMin) * 60000).toISOString();
    const lp = localParts(newStart);
    const next = { ...b, start: newStart, end, date: lp.date, time: lp.time };
    if (b.calendar?.eventId) {
      try {
        await patchEvent(b.calendar.eventId, { start: { dateTime: newStart, timeZone: 'America/Los_Angeles' }, end: { dateTime: end, timeZone: 'America/Los_Angeles' } }, { notify: settings.inviteApplicant });
        next.calendar = { ...b.calendar, status: 'synced', error: '', syncedAt: new Date().toISOString() };
      } catch (err) {
        if (by !== 'admin') throw new BookingError('목사님 캘린더의 일정을 바꾸지 못해 변경되지 않았어요. 잠시 후 다시 시도해 주세요.', 503, 'calendar');
        next.calendar = { ...b.calendar, status: 'error', error: '일정 변경이 캘린더에 반영되지 않음: ' + err.message };
      }
    }
    next.history = [...(b.history || []), { at: new Date().toISOString(), what: `${by === 'admin' ? '목회자가' : '신청자가'} 일정 변경: ${fmtDate(old.start)} ${fmtTime(old.start)} → ${fmtDate(newStart)} ${fmtTime(newStart)}` }];
    next.reminded = false;
    await putBooking(next);
    return { booking: next, old };
  });
}

// ---------- 취소 (캘린더 일정도 함께 삭제)
export async function cancel(id, { by, reason }) {
  const settings = await getSettings();
  const b = await getBooking(id);
  if (!b) throw new BookingError('예약을 찾을 수 없습니다.', 404);
  if (b.status === 'cancelled') return { booking: b, already: true };
  if (b.status !== 'confirmed') throw new BookingError('이미 끝난 심방은 취소할 수 없어요.', 409);
  const next = { ...b, status: 'cancelled', cancelledAt: new Date().toISOString(), cancelledBy: by, cancelReason: String(reason || '').slice(0, 200) };
  if (b.calendar?.eventId) {
    try {
      await deleteEvent(b.calendar.eventId, { notify: settings.inviteApplicant });
      next.calendar = { ...b.calendar, status: 'deleted', error: '', syncedAt: new Date().toISOString() };
    } catch (err) {
      if (by !== 'admin') throw new BookingError('목사님 캘린더의 일정을 지우지 못해 취소되지 않았어요. 잠시 후 다시 시도해 주세요.', 503, 'calendar');
      next.calendar = { ...b.calendar, status: 'error', error: '캘린더 일정이 아직 남아 있음: ' + err.message };
    }
  }
  next.history = [...(b.history || []), { at: new Date().toISOString(), what: `${by === 'admin' ? '목회자가' : '신청자가'} 취소${reason ? ' · ' + reason : ''}` }];
  await putBooking(next);
  return { booking: next };
}

// ---------- 관리자: 직접 등록 (전화·카톡으로 정한 일정)
export async function adminCreate(input, startIso, { appUrl, force, sendMailToApplicant }) {
  return withLock(async () => {
    const settings = await getSettings();
    const b = newBooking(input, startIso, settings, 'admin');
    if (!force) {
      const d = b.date;
      const { s, e } = dayBounds(d, d);
      const bookings = (await listBookings(s - 864e5, e + 864e5)).filter(ACTIVE);
      const clash = bookings.find((x) => Date.parse(x.start) < Date.parse(b.end) && Date.parse(x.end) > Date.parse(b.start));
      if (clash) throw new BookingError(`같은 시간에 ${clash.name}님 심방이 있습니다. 그래도 등록하려면 '겹쳐도 등록'을 눌러 주세요.`, 409, 'clash');
      const ready = await calendarReady();
      if (ready.ok) {
        try {
          const busy = await freeBusy(new Date(Date.parse(b.start)).toISOString(), b.end, settings.busyCalendars);
          if (busy.length) throw new BookingError('Google 캘린더에 이 시간 다른 일정이 있습니다. 그래도 등록하려면 \'겹쳐도 등록\'을 눌러 주세요.', 409, 'clash');
        } catch (err) { if (err instanceof BookingError) throw err; }
      }
    }
    if (b.email) {
      const tok = await issueManageToken(b.id);
      b.tokenHash = tok.hash; b.tokenEnc = encrypt(tok.token);
    }
    const ready = await calendarReady();
    if (ready.ok) {
      try { await createCalendarEvent(b, settings, appUrl); }
      catch (err) { b.calendar = { eventId: '', status: 'error', error: '캘린더에 만들지 못함: ' + err.message }; }
    } else {
      b.calendar = { eventId: '', status: 'error', error: '캘린더가 연결되지 않아 앱에만 저장됨' };
    }
    b.sendApplicantMail = Boolean(sendMailToApplicant && b.email);
    await putBooking(b);
    return { booking: b };
  });
}

// ---------- 관리자: 정보 수정 (만남 방식·장소·연락처 등) + 캘린더 반영
export async function adminUpdate(id, patch, { appUrl }) {
  const settings = await getSettings();
  const b = await getBooking(id);
  if (!b) throw new BookingError('예약을 찾을 수 없습니다.', 404);
  const next = { ...b, ...patch };
  if (next.mode === 'online') next.place = '';
  if (b.status === 'confirmed' && b.calendar?.eventId) {
    const body = eventBody(next, settings, appUrl);
    const addMeet = next.mode === 'online' && settings.meetLinks && !b.meetUrl;
    try {
      const ev = await patchEvent(b.calendar.eventId, { summary: body.summary, description: body.description, location: body.location, ...(addMeet ? meetRequest(next) : {}) }, { notify: false, meet: addMeet });
      if (addMeet) next.meetUrl = meetUrlOf(ev) || '';
      next.calendar = { ...b.calendar, status: 'synced', error: '', syncedAt: new Date().toISOString() };
    } catch (err) {
      next.calendar = { ...b.calendar, status: 'error', error: '변경 내용이 캘린더에 반영되지 않음: ' + err.message };
    }
  }
  if (next.mode !== 'online' && b.mode === 'online') next.meetUrl = '';
  next.history = [...(b.history || []), { at: new Date().toISOString(), what: '목회자가 정보 수정' }];
  await putBooking(next);
  return { booking: next };
}

export async function setStatus(id, status) {
  const b = await getBooking(id);
  if (!b) throw new BookingError('예약을 찾을 수 없습니다.', 404);
  if (!['confirmed', 'completed', 'noshow'].includes(status)) throw new BookingError('바꿀 수 없는 상태입니다.');
  if (b.status === 'cancelled') throw new BookingError('취소된 예약입니다.', 409);
  const next = { ...b, status, history: [...(b.history || []), { at: new Date().toISOString(), what: { confirmed: '예약 확정으로 되돌림', completed: '심방 완료', noshow: '미진행' }[status] }] };
  await putBooking(next);
  return { booking: next };
}

// ---------- 캘린더와 맞춰 보기 (불일치 찾기)
export async function checkSync({ fromMs = Date.now() - 864e5 } = {}) {
  const ready = await calendarReady();
  if (!ready.ok) throw new BookingError('캘린더가 연결되어 있지 않습니다.', 409);
  const list = (await listBookings(fromMs, fromMs + 400 * 864e5)).filter((b) => b.status === 'confirmed');
  const issues = [];
  for (const b of list) {
    if (!b.calendar?.eventId) { issues.push({ id: b.id, kind: 'noevent', text: '캘린더에 일정이 없습니다 (연결 전 등록 또는 생성 실패).' }); continue; }
    try {
      const ev = await getEvent(b.calendar.eventId);
      if (!ev || ev.status === 'cancelled') { issues.push({ id: b.id, kind: 'missing', text: 'Google 캘린더에서 일정이 삭제되었습니다.' }); continue; }
      const es = new Date(ev.start?.dateTime || 0).toISOString(), ee = new Date(ev.end?.dateTime || 0).toISOString();
      if (es !== b.start || ee !== b.end) issues.push({ id: b.id, kind: 'moved', text: `캘린더에서 시간이 바뀌었습니다: ${fmtDate(es)} ${fmtTime(es)}`, calStart: es, calEnd: ee });
    } catch (err) {
      issues.push({ id: b.id, kind: 'error', text: '확인하지 못함: ' + err.message });
    }
  }
  const out = [];
  for (const i of issues) {
    const b = list.find((x) => x.id === i.id);
    out.push({ ...i, name: b.name, start: b.start });
    await putBooking({ ...b, calendar: { ...b.calendar, status: i.kind === 'moved' ? 'moved' : i.kind === 'error' ? 'error' : 'missing', error: i.text, calStart: i.calStart || '', calEnd: i.calEnd || '' } });
  }
  // 문제 없던 것은 정상으로 표시
  for (const b of list) if (!issues.find((i) => i.id === b.id) && b.calendar?.status !== 'synced') await putBooking({ ...b, calendar: { ...b.calendar, status: 'synced', error: '', syncedAt: new Date().toISOString() } });
  return { checked: list.length, issues: out };
}

// 불일치 고치기: 캘린더에 다시 만들기 / 캘린더 시간을 앱에 반영
export async function fixSync(id, action, { appUrl }) {
  return withLock(async () => {
    const settings = await getSettings();
    const b = await getBooking(id);
    if (!b || b.status !== 'confirmed') throw new BookingError('예약 확정 상태의 예약만 고칠 수 있습니다.', 409);
    const next = { ...b };
    if (action === 'recreate') {
      await createCalendarEvent(next, settings, appUrl);
      next.history = [...(b.history || []), { at: new Date().toISOString(), what: '캘린더에 일정 다시 만듦' }];
    } else if (action === 'adoptCalendar') {
      if (!b.calendar?.calStart) throw new BookingError('캘린더 시간 정보가 없습니다. 먼저 동기화 점검을 해 주세요.');
      const lp = localParts(b.calendar.calStart);
      Object.assign(next, { start: b.calendar.calStart, end: b.calendar.calEnd, date: lp.date, time: lp.time, durationMin: Math.round((Date.parse(b.calendar.calEnd) - Date.parse(b.calendar.calStart)) / 60000) });
      next.calendar = { ...b.calendar, status: 'synced', error: '', calStart: '', calEnd: '' };
      next.history = [...(b.history || []), { at: new Date().toISOString(), what: '캘린더에서 바뀐 시간을 앱에 반영' }];
    } else if (action === 'pushApp') {
      await patchEvent(b.calendar.eventId, { start: { dateTime: b.start, timeZone: 'America/Los_Angeles' }, end: { dateTime: b.end, timeZone: 'America/Los_Angeles' } }, { notify: settings.inviteApplicant });
      next.calendar = { ...b.calendar, status: 'synced', error: '', calStart: '', calEnd: '' };
      next.history = [...(b.history || []), { at: new Date().toISOString(), what: '캘린더 시간을 앱 시간으로 되돌림' }];
    } else throw new BookingError('알 수 없는 작업');
    await putBooking(next);
    return { booking: next };
  });
}

// ---------- 알림 메일 (응답 뒤에 보냄 — 실패해도 예약은 유지하고 기록만 남김)
export function adminRecipients(settings) {
  const env = String(process.env.ADMIN_EMAILS || '').split(',').map((x) => x.trim().toLowerCase()).filter(Boolean);
  return settings.notifyEmails.length ? settings.notifyEmails : env;
}
export const manageUrlOf = (b, appUrl) => (b.tokenEnc ? `${appUrl}/booking/manage/${decrypt(b.tokenEnc)}` : '');

export async function notify(id, { applicant, admin, appUrl, extra }) {
  if (!mailReady()) { await addLog('mail', '메일 설정이 없어 알림을 보내지 못함'); return; }
  const settings = await getSettings();
  const b = await getBooking(id);
  if (!b) return;
  const log = [];
  if (applicant && b.email) {
    try { await sendMail({ to: b.email, ...applicantMail(applicant, b, { settings, appUrl, manageUrl: manageUrlOf(b, appUrl) }) }); log.push({ at: new Date().toISOString(), kind: applicant, to: 'applicant', ok: true }); }
    catch (e) { log.push({ at: new Date().toISOString(), kind: applicant, to: 'applicant', ok: false, error: e.message }); await addLog('mail', `신청자 메일 실패(${applicant}): ${e.message}`); }
  }
  if (admin) {
    const to = adminRecipients(settings);
    for (const addr of to) {
      try { await sendMail({ to: addr, ...adminMail(admin, b, { settings, appUrl, extra }) }); log.push({ at: new Date().toISOString(), kind: admin, to: 'admin', ok: true }); }
      catch (e) { log.push({ at: new Date().toISOString(), kind: admin, to: 'admin', ok: false, error: e.message }); await addLog('mail', `목회자 알림 실패(${admin}): ${e.message}`); }
    }
  }
  const cur = await getBooking(id);
  if (cur) await putBooking({ ...cur, mail: [...(cur.mail || []), ...log].slice(-20) });
}

// 신청자에게 보여도 되는 정보만
export function publicView(b, settings) {
  return {
    ref: b.ref, status: b.status, start: b.start, end: b.end, date: b.date, time: b.time,
    name: b.name, mode: b.mode, place: b.place, placeText: placeText(b, settings), meetUrl: b.meetUrl || '',
    cancelledBy: b.cancelledBy || '',
  };
}
