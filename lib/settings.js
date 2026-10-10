// 심방 가능 시간 설정 — 기본값과 정리 (화면·서버 공용)
export const DEFAULT_SETTINGS = {
  open: true,               // 온라인 신청 받기
  pastorName: '안정현 목사',
  durationMin: 60,          // 심방 시간
  stepMin: 60,              // 시간 선택 간격
  minNoticeHours: 24,       // 최소 사전 신청
  horizonDays: 30,          // 예약 가능 범위 (오늘부터)
  maxPerDay: 3,             // 하루 최대
  bufferMin: 15,            // 심방 사이 준비·이동 시간
  // 요일별 가능 시간 (0=일 … 6=토). 여러 구간 가능
  weekly: {
    0: [],
    1: [],
    2: [{ start: '10:00', end: '18:00' }],
    3: [{ start: '10:00', end: '18:00' }],
    4: [{ start: '10:00', end: '18:00' }],
    5: [{ start: '10:00', end: '18:00' }],
    6: [{ start: '10:00', end: '15:00' }],
  },
  blackouts: [],            // [{ date: 시작 'YYYY-MM-DD', end: 끝(하루면 비움), note }] — 기간으로 막기
  churchPlace: '남가주 사랑의교회 (1111 N Brookhurst St, Anaheim, CA 92801)',
  meetLinks: true,          // 온라인 심방에 Google Meet 링크 자동 생성
  inviteApplicant: true,    // 캘린더 초대장을 신청자에게도 보내기
  busyCalendars: [],        // 바쁜 시간을 함께 확인할 다른 캘린더 ID
  notifyEmails: [],         // 새 신청 알림 받을 이메일 (비어 있으면 ADMIN_EMAILS)
  retentionMonths: 24,      // 기록 보관 기간
};

const clampNum = (v, lo, hi, d) => { const n = Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, Math.round(n))) : d; };
const HM = /^([01]\d|2[0-3]):[0-5]\d$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeSettings(x) {
  const s = { ...DEFAULT_SETTINGS, ...(x && typeof x === 'object' ? x : {}) };
  const weekly = {};
  for (let d = 0; d < 7; d++) {
    const list = Array.isArray(s.weekly?.[d]) ? s.weekly[d] : [];
    weekly[d] = list.filter((r) => HM.test(r?.start) && HM.test(r?.end) && r.start < r.end).map((r) => ({ start: r.start, end: r.end }))
      .sort((a, b) => a.start.localeCompare(b.start)).slice(0, 6);
  }
  return {
    open: s.open !== false,
    pastorName: String(s.pastorName || '').slice(0, 40),
    durationMin: clampNum(s.durationMin, 15, 240, 60),
    stepMin: clampNum(s.stepMin, 15, 240, 60),
    minNoticeHours: clampNum(s.minNoticeHours, 0, 24 * 14, 24),
    horizonDays: clampNum(s.horizonDays, 1, 180, 30),
    maxPerDay: clampNum(s.maxPerDay, 1, 20, 3),
    bufferMin: clampNum(s.bufferMin, 0, 180, 15),
    weekly,
    blackouts: (Array.isArray(s.blackouts) ? s.blackouts : []).filter((b) => /^\d{4}-\d{2}-\d{2}$/.test(b?.date))
      .map((b) => ({ date: b.date, end: /^\d{4}-\d{2}-\d{2}$/.test(b.end || '') && b.end > b.date ? b.end : '', note: String(b.note || '').slice(0, 60) })).sort((a, b) => a.date.localeCompare(b.date)),
    churchPlace: String(s.churchPlace || '').slice(0, 200),
    meetLinks: s.meetLinks !== false,
    inviteApplicant: s.inviteApplicant !== false,
    busyCalendars: (Array.isArray(s.busyCalendars) ? s.busyCalendars : []).map((c) => String(c).trim()).filter(Boolean).slice(0, 10),
    notifyEmails: (Array.isArray(s.notifyEmails) ? s.notifyEmails : []).map((e) => String(e).trim().toLowerCase()).filter((e) => EMAIL.test(e)).slice(0, 10),
    retentionMonths: clampNum(s.retentionMonths, 3, 120, 24),
  };
}

export const MODES = {
  church: { label: '교회에서 만나요', short: '교회', desc: '교회에서 편하게 만나요.' },
  outside: { label: '교회 밖에서 만나요', short: '교회 밖', desc: '카페, 식당, 집 근처 등 편한 곳에서요.' },
  online: { label: '온라인으로 만나요', short: '온라인', desc: 'Google Meet 화상으로 만나요.' },
};

export const STATUS = {
  confirmed: { label: '예약 확정', tone: 'blue' },
  completed: { label: '심방 완료', tone: 'green' },
  cancelled: { label: '취소', tone: 'muted' },
  noshow: { label: '미진행', tone: 'coral' },
};

// 화면·메일에 보일 장소 문구
export function placeText(b, settings) {
  if (b.mode === 'online') return b.meetUrl ? '온라인 (Google Meet)' : '온라인 (링크는 따로 안내드려요)';
  if (b.mode === 'church') return b.place ? `교회 · ${b.place}` : (settings?.churchPlace || '교회');
  return b.place ? b.place : '장소 추후 협의';
}

// 이 날짜가 '신청 받지 않는 날(기간)'에 들어가는지
export const isBlackout = (blackouts, d) => (blackouts || []).some((b) => d >= b.date && d <= (b.end || b.date));
