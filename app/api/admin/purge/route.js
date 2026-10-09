import { guardAdmin, json } from '@/lib/auth';
import { getSettings, listBookings, deleteBooking } from '@/lib/store';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// 보관 기간이 지난 심방 기록(예약 정보 + 목양 메모)을 영구 삭제
export async function POST(req) {
  const g = await guardAdmin(req); if (g.error) return g.error;
  const { dryRun } = await req.json().catch(() => ({}));
  const s = await getSettings();
  const cutoff = Date.now() - s.retentionMonths * 30.44 * 864e5;
  const old = (await listBookings(0, cutoff)).filter((b) => Date.parse(b.end) < cutoff);
  if (!dryRun) for (const b of old) await deleteBooking(b);
  return json({ count: old.length, deleted: !dryRun, months: s.retentionMonths });
}
