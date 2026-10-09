import { guardAdmin, json, fail } from '@/lib/auth';
import { getBooking, getNote, putNote } from '@/lib/store';

export const dynamic = 'force-dynamic';

// 비공개 목양 메모 — 관리자만. 메일·캘린더 어디에도 나가지 않음
export async function GET(req) {
  const g = await guardAdmin(req); if (g.error) return g.error;
  const id = new URL(req.url).searchParams.get('id');
  if (!(await getBooking(id))) return fail('예약을 찾을 수 없습니다.', 404);
  return json({ note: (await getNote(id)) || { memo: '', followUp: false, nextVisit: '' } });
}

export async function POST(req) {
  const g = await guardAdmin(req); if (g.error) return g.error;
  const { id, memo, followUp, nextVisit } = await req.json().catch(() => ({}));
  if (!(await getBooking(id))) return fail('예약을 찾을 수 없습니다.', 404);
  const n = { memo: String(memo || '').slice(0, 5000), followUp: !!followUp, nextVisit: String(nextVisit || '').slice(0, 60), by: g.session.who };
  await putNote(id, n);
  return json({ note: n });
}
