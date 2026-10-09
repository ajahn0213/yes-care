// 서명·토큰·암호화 (서버 전용)
import crypto from 'crypto';

// SESSION_SECRET이 없으면 다른 비밀 값들로부터 만들어 씀 (넣어 두는 것을 권장)
function baseSecret() {
  const s = process.env.SESSION_SECRET;
  if (s && s.length >= 16) return s;
  const seed = 'yes-care:' + (process.env.GOOGLE_CLIENT_SECRET || '') + ':' + (process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || '') + ':' + (process.env.ADMIN_PASSWORD || '');
  return crypto.createHash('sha256').update(seed).digest('hex');
}
const key = (purpose) => crypto.createHmac('sha256', baseSecret()).update(purpose).digest();

export function sign(payload, ttlSec) {
  const body = Buffer.from(JSON.stringify({ ...payload, exp: Date.now() + ttlSec * 1000 })).toString('base64url');
  const sig = crypto.createHmac('sha256', key('sign')).update(body).digest('base64url');
  return body + '.' + sig;
}
export function verify(token) {
  if (!token || typeof token !== 'string') return null;
  const [body, sig] = token.split('.');
  if (!body || !sig) return null;
  const expect = crypto.createHmac('sha256', key('sign')).update(body).digest('base64url');
  const a = Buffer.from(sig), b = Buffer.from(expect);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const p = JSON.parse(Buffer.from(body, 'base64url').toString());
    return p.exp > Date.now() ? p : null;
  } catch { return null; }
}

export const randomToken = (bytes = 32) => crypto.randomBytes(bytes).toString('base64url');
export const sha = (s) => crypto.createHmac('sha256', key('hash')).update(String(s)).digest('hex');

// 저장용 암호화 (Google refresh token, 예약 관리 토큰)
export function encrypt(text) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', key('enc'), iv);
  const enc = Buffer.concat([c.update(String(text), 'utf8'), c.final()]);
  return [iv.toString('base64url'), c.getAuthTag().toString('base64url'), enc.toString('base64url')].join('.');
}
export function decrypt(blob) {
  try {
    const [iv, tag, enc] = String(blob).split('.').map((x) => Buffer.from(x, 'base64url'));
    const d = crypto.createDecipheriv('aes-256-gcm', key('enc'), iv);
    d.setAuthTag(tag);
    return Buffer.concat([d.update(enc), d.final()]).toString('utf8');
  } catch { return null; }
}

// 짧은 신청 번호 (예: YC-7K2F9Q) — 혼동되는 글자 제외
export function refCode() {
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const b = crypto.randomBytes(6);
  return 'YC-' + Array.from(b, (x) => A[x % A.length]).join('');
}
