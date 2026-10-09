import { after } from 'next/server';
import { bookPublic, notify, publicView, BookingError } from '@/lib/booking';
import { hasStore, rateLimit, getSettings } from '@/lib/store';
import { appUrl } from '@/lib/google';
import { cleanApplicant, isIsoStart } from '@/lib/validate';
import { clientIp, sameOrigin, json, fail } from '@/lib/auth';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(req) {
  if (!hasStore) return fail('앱 설정을 마무리하고 있어요.', 503);
  if (!sameOrigin(req)) return fail('잘못된 요청입니다.', 403);
  const ip = clientIp(req);
  if (!(await rateLimit('book', ip, 12, 3600))) return fail('신청이 너무 많이 들어왔어요. 잠시 후 다시 시도해 주세요.', 429);
  const body = await req.json().catch(() => null);
  if (!body) return fail('신청 내용을 읽지 못했어요.');
  if (body.website) return fail('신청을 처리하지 못했어요.', 400); // 자동 입력 봇 방지용 숨은 칸
  if (body.consent !== true) return fail('개인정보 이용 안내에 동의해 주세요.');
  if (!isIsoStart(body.start)) return fail('시간을 다시 골라 주세요.');
  const { value, errors, ok } = cleanApplicant(body);
  if (!ok) return fail(Object.values(errors)[0], 400, { fields: errors });
  if (!(await rateLimit('book-email', value.email, 4, 86400))) return fail('같은 이메일로 신청이 너무 많아요. 목사님께 직접 연락해 주세요.', 429);
  const base = appUrl(req);
  try {
    const { booking, token } = await bookPublic(value, body.start, { appUrl: base });
    after(() => notify(booking.id, { applicant: 'confirmed', admin: 'created', appUrl: base }));
    const settings = await getSettings();
    return json({ ok: true, booking: publicView(booking, settings), manageUrl: `${base}/booking/manage/${token}`, manageToken: token });
  } catch (e) {
    if (e instanceof BookingError) return fail(e.message, e.status, { code: e.code });
    console.error('book failed', e?.message);
    return fail('예약을 확정하지 못했어요. 잠시 후 다시 시도해 주세요.', 500);
  }
}
