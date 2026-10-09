// 입력값 정리·검증 (서버에서 다시 검사)
import { MODES } from './settings';

const EMAIL = /^[^\s@<>()",;]+@[^\s@<>()",;]+\.[^\s@<>()",;]{2,}$/;
const clean = (v, max) => String(v ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim().slice(0, max);

export function cleanApplicant(x = {}) {
  const out = {
    name: clean(x.name, 40),
    email: clean(x.email, 120).toLowerCase(),
    phone: clean(x.phone, 30).replace(/[^\d+\-() .]/g, ''),
    group: clean(x.group, 60),
    mode: MODES[x.mode] ? x.mode : '',
    place: clean(x.place, 200),
    topics: clean(x.topics, 1500),
    prayer: clean(x.prayer, 1500),
  };
  const errors = {};
  if (out.name.length < 1) errors.name = '이름을 적어 주세요.';
  if (!EMAIL.test(out.email)) errors.email = '이메일 주소를 확인해 주세요.';
  if (!out.mode) errors.mode = '만남 방식을 골라 주세요.';
  if (out.phone && out.phone.replace(/\D/g, '').length < 7) errors.phone = '휴대전화 번호를 확인해 주세요.';
  if (out.mode === 'online') out.place = '';
  return { value: out, errors, ok: Object.keys(errors).length === 0 };
}

export const isIsoStart = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/.test(s) && !Number.isNaN(Date.parse(s));
