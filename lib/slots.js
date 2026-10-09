// 예약 가능 시간 계산 (순수 함수 — 서버에서 사용, 테스트하기 쉽게 분리)
// 가능 시간 = 요일별 설정 구간 − 휴무일 − 최소 사전 신청 − 하루 최대 − (캘린더 바쁜 시간 + 앱 예약) ± 완충 시간
import { zonedToUtc, addDays, dowOf, toMin, fromMin, localParts } from './time';

export const ACTIVE = (b) => b.status === 'confirmed' || b.status === 'completed';

export function dateRange(settings, nowMs) {
  const from = localParts(nowMs).date;
  return { from, to: addDays(from, settings.horizonDays) };
}

// busy: [{start, end}] (ms) — Google 캘린더의 바쁜 시간 (앱이 만든 심방 일정도 여기에 포함됨)
// bookings: 앱의 예약 (캘린더 연결이 끊긴 사이 등록된 것까지 막기 위해 함께 계산)
export function computeSlots({ settings, busy = [], bookings = [], nowMs = Date.now(), from, to, excludeId }) {
  const dur = settings.durationMin * 60000;
  const buf = settings.bufferMin * 60000;
  const earliest = nowMs + settings.minNoticeHours * 3600000;
  const range = dateRange(settings, nowMs);
  const start = from && from > range.from ? from : range.from;
  const end = to && to < range.to ? to : range.to;
  const blocked = new Set(settings.blackouts.map((b) => b.date));
  const mine = bookings.filter((b) => ACTIVE(b) && b.id !== excludeId);
  const intervals = [
    ...busy.map((b) => ({ s: b.start - buf, e: b.end + buf })),
    ...mine.map((b) => ({ s: Date.parse(b.start) - buf, e: Date.parse(b.end) + buf })),
  ];
  const perDay = {};
  mine.forEach((b) => { perDay[b.date] = (perDay[b.date] || 0) + 1; });

  const days = {};
  for (let d = start; d <= end; d = addDays(d, 1)) {
    if (blocked.has(d)) continue;
    if ((perDay[d] || 0) >= settings.maxPerDay) continue;
    const windows = settings.weekly[dowOf(d)] || [];
    const list = [];
    for (const w of windows) {
      for (let m = toMin(w.start); m + settings.durationMin <= toMin(w.end); m += settings.stepMin) {
        const s = zonedToUtc(d, fromMin(m));
        const e = s + dur;
        if (s < earliest) continue;
        if (intervals.some((x) => s < x.e && e > x.s)) continue;
        list.push({ start: new Date(s).toISOString(), time: fromMin(m) });
      }
    }
    if (list.length) days[d] = list;
  }
  return days;
}

// 한 시간이 지금 가능한지 (확정 직전 서버 재검증용)
export function isSlotOpen(args, startIso) {
  const d = localParts(startIso).date;
  const days = computeSlots({ ...args, from: d, to: d });
  return Boolean(days[d]?.some((x) => x.start === new Date(startIso).toISOString()));
}
