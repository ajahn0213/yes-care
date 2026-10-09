// 관리자 화면 → 서버 호출 (전용 헤더로 CSRF 방어)
export async function api(path, body) {
  const r = await fetch(path, body === undefined
    ? { cache: 'no-store' }
    : { method: 'POST', headers: { 'content-type': 'application/json', 'x-yes-care': '1' }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (r.status === 401) { window.location.href = '/admin/login'; throw new Error('다시 로그인해 주세요.'); }
  if (!r.ok) throw Object.assign(new Error(j.error || '처리하지 못했습니다.'), { code: j.code, data: j });
  return j;
}
