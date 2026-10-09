import { availability } from '@/lib/booking';
import { hasStore, rateLimit } from '@/lib/store';
import { clientIp, json, fail } from '@/lib/auth';

export const dynamic = 'force-dynamic';

// 신청자에게 가능한 시간만 (캘린더 일정 내용·바쁜 시간 자체는 내보내지 않음)
export async function GET(req) {
  if (!hasStore) return json({ ready: false, reason: 'setup', message: '앱 설정을 마무리하고 있어요.' });
  if (!(await rateLimit('av', clientIp(req), 60, 60))) return fail('잠시 후 다시 시도해 주세요.', 429);
  const q = new URL(req.url).searchParams;
  const d = (x) => (/^\d{4}-\d{2}-\d{2}$/.test(x || '') ? x : undefined);
  try {
    const r = await availability({ from: d(q.get('from')), to: d(q.get('to')) });
    const s = r.settings;
    return json({
      ready: r.ready, reason: r.reason || '', message: r.message || '',
      durationMin: s.durationMin, horizonDays: s.horizonDays, pastorName: s.pastorName, churchPlace: s.churchPlace, meetLinks: s.meetLinks,
      days: r.ready ? Object.fromEntries(Object.entries(r.days).map(([k, v]) => [k, v.map((x) => ({ start: x.start, time: x.time }))])) : {},
    });
  } catch (e) {
    return json({ ready: false, reason: 'error', message: '목사님 일정을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.' }, 503);
  }
}
