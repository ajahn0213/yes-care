import { guardAdmin, json } from '@/lib/auth';
import { listBookings, getNotes } from '@/lib/store';

export const dynamic = 'force-dynamic';

// 심방 대상자: 이메일(없으면 이름+연락처)로 묶은 이력
export async function GET(req) {
  const g = await guardAdmin(req); if (g.error) return g.error;
  const all = await listBookings();
  const notes = await getNotes(all.map((b) => b.id));
  const map = new Map();
  for (const b of all) {
    const key = b.email || `${b.name}|${b.phone}`;
    const p = map.get(key) || { key, name: b.name, email: b.email, phone: b.phone, group: b.group, visits: [] };
    p.name = b.name || p.name; p.phone = b.phone || p.phone; p.group = b.group || p.group;
    const n = notes[b.id];
    p.visits.push({ id: b.id, start: b.start, status: b.status, mode: b.mode, followUp: !!n?.followUp, nextVisit: n?.nextVisit || '', hasMemo: !!(n?.memo || '').trim() });
    map.set(key, p);
  }
  const now = Date.now();
  const people = [...map.values()].map((p) => {
    const done = p.visits.filter((v) => v.status === 'completed');
    const last = done.slice(-1)[0];
    const latestNote = [...p.visits].reverse().find((v) => v.followUp || v.nextVisit || v.hasMemo);
    return {
      ...p,
      completed: done.length,
      lastVisit: last?.start || '',
      upcoming: p.visits.find((v) => v.status === 'confirmed' && Date.parse(v.start) > now)?.start || '',
      followUp: !!p.visits.slice(-1)[0]?.followUp || !!(latestNote && latestNote.followUp),
      nextVisit: latestNote?.nextVisit || '',
    };
  }).sort((a, b) => (b.upcoming || b.lastVisit || '').localeCompare(a.upcoming || a.lastVisit || ''));
  return json({ people });
}
