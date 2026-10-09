// 저장소 (Upstash Redis) — 서버 전용
// 다른 YES 앱과 같은 데이터베이스를 써도 되도록 모든 키는 'care:'로 시작합니다.
import { Redis } from '@upstash/redis';
import { normalizeSettings } from './settings';
import { randomToken, sha } from './secure';

const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
export const hasStore = Boolean(url && token);
const redis = hasStore ? new Redis({ url, token }) : null;

const P = 'care:';
const K = {
  settings: P + 'settings',
  google: P + 'google',
  index: P + 'bk',                // zset: score=시작 시각(ms), member=예약 id
  booking: (id) => P + 'b:' + id,
  token: (h) => P + 'tok:' + h,   // 예약 관리 토큰 해시 → 예약 id
  note: (id) => P + 'note:' + id, // 비공개 목양 메모 (예약 정보와 분리)
  lock: P + 'lock',
  rl: (k) => P + 'rl:' + k,
  log: P + 'log',
};

function need() { if (!redis) throw new Error('저장소(Upstash Redis)가 연결되지 않았습니다.'); }
const parse = (v) => (v == null ? null : typeof v === 'string' ? (() => { try { return JSON.parse(v); } catch { return null; } })() : v);

// ---- 설정
export async function getSettings() { need(); return normalizeSettings(parse(await redis.get(K.settings))); }
export async function saveSettings(s) { need(); const n = normalizeSettings(s); await redis.set(K.settings, JSON.stringify(n)); return n; }

// ---- Google 연결 정보 (refresh token은 암호화해서 보관)
export async function getGoogle() { need(); return parse(await redis.get(K.google)); }
export async function setGoogle(v) { need(); if (v) await redis.set(K.google, JSON.stringify(v)); else await redis.del(K.google); }

// ---- 예약
export async function getBooking(id) { need(); if (!/^[\w-]{6,40}$/.test(String(id || ''))) return null; return parse(await redis.get(K.booking(id))); }
export async function putBooking(b) {
  need();
  b.updatedAt = new Date().toISOString();
  await redis.set(K.booking(b.id), JSON.stringify(b));
  await redis.zadd(K.index, { score: Date.parse(b.start), member: b.id });
  return b;
}
export async function deleteBooking(b) {
  need();
  await redis.del(K.booking(b.id));
  await redis.del(K.note(b.id));
  if (b.tokenHash) await redis.del(K.token(b.tokenHash));
  await redis.zrem(K.index, b.id);
}
// 기간 안의 예약 (ms)
export async function listBookings(fromMs = 0, toMs = 8.64e15) {
  need();
  const ids = await redis.zrange(K.index, fromMs, toMs, { byScore: true });
  if (!ids.length) return [];
  const out = [];
  for (let i = 0; i < ids.length; i += 100) {
    const vals = await redis.mget(...ids.slice(i, i + 100).map(K.booking));
    vals.forEach((v) => { const b = parse(v); if (b) out.push(b); });
  }
  return out.sort((a, b) => a.start.localeCompare(b.start));
}

// 예약 관리 링크: 원래 토큰은 이메일 링크로만 전달, 저장은 해시
export async function issueManageToken(id) {
  need();
  const t = randomToken(24);
  const h = sha(t);
  await redis.set(K.token(h), id);
  return { token: t, hash: h };
}
export async function bookingByToken(t) {
  need();
  if (!t || typeof t !== 'string' || t.length < 20 || t.length > 80) return null;
  const id = await redis.get(K.token(sha(t)));
  return id ? getBooking(String(id)) : null;
}

// ---- 비공개 목양 메모
export async function getNote(id) { need(); return parse(await redis.get(K.note(id))); }
export async function getNotes(ids) {
  need();
  if (!ids.length) return {};
  const out = {};
  for (let i = 0; i < ids.length; i += 100) {
    const part = ids.slice(i, i + 100);
    const vals = await redis.mget(...part.map(K.note));
    vals.forEach((v, k) => { const n = parse(v); if (n) out[part[k]] = n; });
  }
  return out;
}
export async function putNote(id, n) { need(); await redis.set(K.note(id), JSON.stringify({ ...n, updatedAt: new Date().toISOString() })); }

// ---- 예약 확정 구간 잠금 (동시에 들어온 신청이 같은 시간을 잡지 못하도록)
export async function withLock(fn, { waitMs = 8000, ttlMs = 25000 } = {}) {
  need();
  const me = 'L' + randomToken(9);
  const until = Date.now() + waitMs;
  for (;;) {
    const ok = await redis.set(K.lock, me, { nx: true, px: ttlMs });
    if (ok) break;
    if (Date.now() > until) throw Object.assign(new Error('지금 신청이 몰려 있어요. 잠시 후 다시 시도해 주세요.'), { status: 503 });
    await new Promise((r) => setTimeout(r, 150 + Math.random() * 200));
  }
  try { return await fn(); }
  finally { try { if ((await redis.get(K.lock)) === me) await redis.del(K.lock); } catch {} }
}

// ---- 요청 횟수 제한 (IP는 해시로만)
export async function rateLimit(bucket, who, limit, windowSec) {
  if (!redis) return true;
  const k = K.rl(`${bucket}:${sha(who).slice(0, 24)}:${Math.floor(Date.now() / 1000 / windowSec)}`);
  const n = await redis.incr(k);
  if (n === 1) await redis.expire(k, windowSec + 5);
  return n <= limit;
}

// ---- 운영 기록 (메일·캘린더 오류 등, 최근 50건 — 개인정보 없이)
export async function addLog(kind, msg) {
  if (!redis) return;
  try {
    const cur = parse(await redis.get(K.log)) || [];
    await redis.set(K.log, JSON.stringify([{ at: new Date().toISOString(), kind, msg: String(msg).slice(0, 300) }, ...cur].slice(0, 50)));
  } catch {}
}
export async function getLog() { need(); return parse(await redis.get(K.log)) || []; }
