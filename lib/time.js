// 시간대 도구 — 모든 일정은 로스앤젤레스 현지 시간(일광절약시간 자동 반영)으로 계산하고,
// 저장·비교는 UTC ISO 문자열로 합니다. (서버/브라우저 공용)
export const TZ = 'America/Los_Angeles';

const pad = (n) => String(n).padStart(2, '0');

// ts(ms)가 TZ에서 몇 년 몇 월 며칠 몇 시인지
function partsIn(ts, tz = TZ) {
  const f = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const o = {};
  f.formatToParts(new Date(ts)).forEach((p) => { if (p.type !== 'literal') o[p.type] = Number(p.value); });
  return o;
}
const offsetAt = (ts, tz) => {
  const p = partsIn(ts, tz);
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(ts / 1000) * 1000;
};

// 'YYYY-MM-DD' + 'HH:MM' (LA 현지) → UTC ms
export function zonedToUtc(date, time, tz = TZ) {
  const [y, m, d] = date.split('-').map(Number);
  const [hh, mm] = time.split(':').map(Number);
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  let ts = guess - offsetAt(guess, tz);
  const o2 = offsetAt(ts, tz);
  ts = guess - o2;
  return ts;
}

// UTC(ms 또는 ISO) → LA 현지 { date: 'YYYY-MM-DD', time: 'HH:MM', dow }
export function localParts(t, tz = TZ) {
  const ts = typeof t === 'number' ? t : Date.parse(t);
  const p = partsIn(ts, tz);
  const date = `${p.year}-${pad(p.month)}-${pad(p.day)}`;
  return { date, time: `${pad(p.hour)}:${pad(p.minute)}`, dow: dowOf(date) };
}

export const todayLA = () => localParts(Date.now()).date;

export function addDays(date, n) {
  const [y, m, d] = date.split('-').map(Number);
  const x = new Date(Date.UTC(y, m - 1, d + n));
  return `${x.getUTCFullYear()}-${pad(x.getUTCMonth() + 1)}-${pad(x.getUTCDate())}`;
}
export const dowOf = (date) => { const [y, m, d] = date.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)).getUTCDay(); };
export const toMin = (hhmm) => { const [h, m] = String(hhmm).split(':').map(Number); return h * 60 + (m || 0); };
export const fromMin = (n) => `${pad(Math.floor(n / 60))}:${pad(n % 60)}`;

export const DOW_KO = ['일', '월', '화', '수', '목', '금', '토'];

// 표시용 (한국어) — 항상 LA 현지 시간
export function fmtDate(t) {
  const { date, dow } = localParts(t);
  const [y, m, d] = date.split('-').map(Number);
  return `${y}년 ${m}월 ${d}일 (${DOW_KO[dow]})`;
}
export function fmtDateShort(date) { // 'YYYY-MM-DD'
  const [, m, d] = date.split('-').map(Number);
  return `${m}월 ${d}일 (${DOW_KO[dowOf(date)]})`;
}
export function fmtTimeHM(hhmm) {
  const n = toMin(hhmm), h = Math.floor(n / 60), m = n % 60;
  const ap = h < 12 ? '오전' : '오후';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${ap} ${h12}:${pad(m)}`;
}
export const fmtTime = (t) => fmtTimeHM(localParts(t).time);
export function fmtRange(start, end) {
  return `${fmtDate(start)} ${fmtTime(start)} – ${fmtTime(end)}`;
}
// 'PDT' / 'PST' 표기
export function tzAbbr(t) {
  try {
    return new Intl.DateTimeFormat('en-US', { timeZone: TZ, timeZoneName: 'short' }).formatToParts(new Date(t)).find((p) => p.type === 'timeZoneName')?.value || 'PT';
  } catch { return 'PT'; }
}
