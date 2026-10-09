// 신청 중인 내용 임시 보관 (이 브라우저 탭에만, 실패해도 동작)
const KEY = 'yes-care-draft';
const DONE = 'yes-care-done';
const read = (k) => { try { return JSON.parse(sessionStorage.getItem(k) || 'null'); } catch { return null; } };
const write = (k, v) => { try { if (v == null) sessionStorage.removeItem(k); else sessionStorage.setItem(k, JSON.stringify(v)); } catch {} };
export const loadDraft = () => read(KEY) || {};
export const saveDraft = (patch) => { const d = { ...loadDraft(), ...patch }; write(KEY, d); return d; };
export const clearDraft = () => write(KEY, null);
export const loadDone = () => read(DONE);
export const saveDone = (v) => write(DONE, v);
