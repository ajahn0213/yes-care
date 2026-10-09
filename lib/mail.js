// 이메일 (Gmail 앱 비밀번호로 발송) — 서버 전용
// 기도 제목·나누고 싶은 내용·목양 메모는 어떤 메일에도 넣지 않습니다.
import { fmtDate, fmtTime, tzAbbr } from './time';
import { MODES, placeText } from './settings';

export const mailReady = () => Boolean(process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

let transport;
export async function sendMail({ to, subject, html, text }) {
  if (!mailReady()) throw new Error('메일 설정(GMAIL_USER, GMAIL_APP_PASSWORD)이 없습니다.');
  const nodemailer = (await import('nodemailer')).default;
  const user = process.env.GMAIL_USER.trim();
  const port = Number(process.env.GMAIL_SMTP_PORT || 465);
  transport = transport || nodemailer.createTransport({
    host: process.env.GMAIL_SMTP_HOST || 'smtp.gmail.com', port, secure: port === 465,
    auth: { user, pass: process.env.GMAIL_APP_PASSWORD.replace(/\s+/g, '') },
    tls: process.env.GMAIL_SMTP_HOST ? { rejectUnauthorized: false } : undefined,
  });
  try {
    await transport.sendMail({ from: { name: process.env.MAIL_FROM_NAME || 'YES 심방', address: user }, to, subject, html, text });
  } catch (e) {
    transport = null;
    if (e.code === 'EAUTH' || e.responseCode === 535 || e.responseCode === 534) throw new Error('Gmail 로그인 실패 — GMAIL_USER와 앱 비밀번호(16자리)를 확인해 주세요.');
    throw new Error('메일을 보내지 못했습니다: ' + (e.message || e));
  }
}

// ---------- 공통 틀 (YES 브랜드)
function frame({ appUrl, eyebrow, title, body, cta, footNote }) {
  const ink = '#112b32';
  return `<!doctype html><html lang="ko"><body style="margin:0;background:#f4f4f1;font-family:-apple-system,'Apple SD Gothic Neo','Pretendard','Malgun Gothic',sans-serif;color:${ink};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f1;padding:24px 12px;"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;">
<tr><td style="height:5px;font-size:0;line-height:0;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
<td style="height:5px;background:#6cb8e6;"></td><td style="height:5px;background:#f26544;"></td><td style="height:5px;background:#febc1e;"></td><td style="height:5px;background:#40b65a;"></td></tr></table></td></tr>
<tr><td style="padding:28px 28px 8px;"><img src="${appUrl}/brand/yes-mark-ink.png" alt="YES" height="26" style="display:block;height:26px;border:0;"></td></tr>
<tr><td style="padding:8px 28px 0;font-size:11px;letter-spacing:.14em;font-weight:700;color:#6d7478;">${esc(eyebrow)}</td></tr>
<tr><td style="padding:6px 28px 4px;font-size:24px;line-height:1.35;font-weight:800;letter-spacing:-.02em;">${esc(title)}</td></tr>
<tr><td style="padding:8px 28px 8px;font-size:15px;line-height:1.75;">${body}</td></tr>
${cta ? `<tr><td style="padding:12px 28px 8px;"><a href="${esc(cta.href)}" style="display:inline-block;background:${ink};color:#ffffff;text-decoration:none;font-weight:700;font-size:15px;padding:14px 22px;">${esc(cta.label)}</a></td></tr>` : ''}
<tr><td style="padding:24px 28px 28px;font-size:12px;line-height:1.7;color:#6d7478;border-top:1px solid #e2e2de;">
${footNote ? esc(footNote) + '<br>' : ''}남가주 사랑의교회 YES 청년부 · YES Pastoral Care<br>
심방은 의료·전문 상담을 대신하지 않습니다. 위급한 상황이면 911, 마음이 많이 힘들면 언제든 988(Suicide &amp; Crisis Lifeline)에 전화나 문자를 해 주세요.
</td></tr></table></td></tr></table></body></html>`;
}

function detailTable(rows) {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:14px 0 4px;border-top:2px solid #112b32;">
${rows.filter(Boolean).map(([k, v]) => `<tr><td style="padding:10px 0;border-bottom:1px solid #e2e2de;font-size:13px;color:#6d7478;width:84px;vertical-align:top;">${esc(k)}</td><td style="padding:10px 0;border-bottom:1px solid #e2e2de;font-size:15px;font-weight:600;">${v}</td></tr>`).join('')}
</table>`;
}
const when = (b) => `${esc(fmtDate(b.start))}<br>${esc(fmtTime(b.start))} – ${esc(fmtTime(b.end))} <span style="color:#6d7478;font-weight:400;">(${esc(tzAbbr(b.start))} · 로스앤젤레스 시간)</span>`;
const whereRows = (b, s) => [
  ['만남 방식', esc(MODES[b.mode]?.label || '')],
  ['장소', esc(placeText(b, s)) + (b.meetUrl ? `<br><a href="${esc(b.meetUrl)}" style="color:#112b32;">${esc(b.meetUrl)}</a>` : '')],
];

export const PREP = [
  ['01', '나의 삶을 돌아보세요.', '요즘 나의 마음은 어떤 상태인가요? 하나님과의 관계는 어떠한가요? 특별히 감사한 일이나 마음에 남아 있는 고민이 있나요?'],
  ['02', '함께 나누고 싶은 이야기를 생각해 보세요.', '믿음의 질문, 진로와 관계의 고민, 삶의 변화, 기도 제목 등 어떤 이야기든 괜찮습니다. 모든 질문에 답을 준비할 필요도 없습니다.'],
  ['03', '기도로 준비해 보세요.', '이 만남이 단순한 대화에 머물지 않고, 하나님께서 우리의 삶을 새롭게 하시는 시간이 되도록 함께 기도하며 준비해 주세요.'],
];
const prepHtml = () => `<div style="margin-top:22px;padding:20px;background:#f4f4f1;">
<div style="font-size:11px;letter-spacing:.14em;font-weight:700;color:#6d7478;">BEFORE WE MEET</div>
<div style="font-size:17px;font-weight:800;margin:4px 0 10px;">심방을 준비하는 세 가지 마음</div>
${PREP.map(([n, h, t]) => `<div style="margin:12px 0;"><b style="font-size:13px;color:#6cb8e6;">${n}</b> <b>${esc(h)}</b><div style="font-size:14px;color:#3d4b50;margin-top:2px;">${esc(t)}</div></div>`).join('')}
<div style="font-size:14px;font-weight:700;margin-top:12px;">완벽하게 준비하지 않으셔도 괜찮습니다. 있는 모습 그대로 오시면 됩니다.</div></div>`;

const plain = (lines) => lines.filter((x) => x != null).join('\n');

// ---------- 신청자에게
export function applicantMail(kind, b, { settings, appUrl, manageUrl }) {
  const pastor = settings.pastorName || '목사님';
  const rows = detailTable([['일시', when(b)], ...whereRows(b, settings), ['신청 번호', esc(b.ref)]]);
  const manage = manageUrl ? { href: manageUrl, label: '예약 확인 · 변경 · 취소' } : null;
  const T = {
    confirmed: {
      subject: '[YES 심방] 우리의 만남이 예약되었습니다.',
      eyebrow: 'YES PASTORAL CARE', title: '심방 신청이 완료되었습니다.',
      lead: `${esc(b.name)}님, 마음을 나눌 시간을 신청해 주셔서 감사합니다. 우리의 만남 가운데 하나님께서 함께하시기를 기대합니다.`,
      prep: true,
    },
    rescheduled: {
      subject: '[YES 심방] 심방 일정이 변경되었습니다.',
      eyebrow: 'SCHEDULE UPDATED', title: '심방 일정이 바뀌었습니다.',
      lead: `${esc(b.name)}님, 새로 정해진 일정을 알려 드립니다.`,
    },
    cancelled: {
      subject: '[YES 심방] 심방 예약이 취소되었습니다.',
      eyebrow: 'CANCELLED', title: '심방 예약이 취소되었습니다.',
      lead: b.cancelledBy === 'admin'
        ? `${esc(b.name)}님, 아쉽게도 아래 심방 일정이 취소되었습니다. ${esc(pastor)}이 따로 연락드릴게요.`
        : `${esc(b.name)}님, 요청하신 대로 아래 심방 예약을 취소했습니다. 언제든 편한 때에 다시 신청해 주세요.`,
      cta: { href: appUrl + '/book', label: '다시 신청하기' },
    },
    reminder: {
      subject: '[YES 심방] 내일 우리의 만남이 있습니다.',
      eyebrow: 'SEE YOU TOMORROW', title: '내일 만나요.',
      lead: `${esc(b.name)}님, 내일 심방 일정을 다시 알려 드립니다. 편안한 마음으로 오세요.`,
      prep: true,
    },
  }[kind];
  const body = `<p style="margin:0 0 6px;">${T.lead}</p>${rows}${T.prep ? prepHtml() : ''}`;
  return {
    subject: T.subject,
    html: frame({ appUrl, eyebrow: T.eyebrow, title: T.title, body, cta: T.cta || (kind !== 'cancelled' ? manage : null),
      footNote: kind !== 'cancelled' ? '일정 변경이나 취소는 위 버튼(예약 관리 링크)에서 하실 수 있어요. 이 링크는 다른 사람과 공유하지 마세요.' : '' }),
    text: plain([T.title, '', T.lead.replace(/<[^>]+>/g, ''), '', `일시: ${fmtDate(b.start)} ${fmtTime(b.start)} – ${fmtTime(b.end)} (${tzAbbr(b.start)}, 로스앤젤레스 시간)`,
      `만남 방식: ${MODES[b.mode]?.label || ''}`, `장소: ${placeText(b, settings)}`, b.meetUrl ? `Google Meet: ${b.meetUrl}` : null, `신청 번호: ${b.ref}`,
      kind !== 'cancelled' && manageUrl ? `\n예약 확인·변경·취소: ${manageUrl}` : null, '', '남가주 사랑의교회 YES 청년부 · YES 심방']),
  };
}

// ---------- 목회자에게 (기도 제목·나눌 내용은 넣지 않고 관리자 화면에서만)
export function adminMail(kind, b, { settings, appUrl, extra }) {
  const T = {
    created: { subject: `[YES 심방] 새 심방 예약 · ${b.name} · ${fmtDate(b.start)} ${fmtTime(b.start)}`, title: '새 심방 예약이 들어왔습니다.' },
    rescheduled: { subject: `[YES 심방] 일정 변경 · ${b.name} → ${fmtDate(b.start)} ${fmtTime(b.start)}`, title: '심방 일정이 변경되었습니다.' },
    cancelled: { subject: `[YES 심방] 예약 취소 · ${b.name} · ${fmtDate(b.start)} ${fmtTime(b.start)}`, title: '심방 예약이 취소되었습니다.' },
  }[kind];
  const rows = detailTable([
    ['신청자', esc(b.name) + (b.group ? ` <span style="color:#6d7478;font-weight:400;">· ${esc(b.group)}</span>` : '')],
    ['일시', when(b)], ...whereRows(b, settings),
    ['연락처', [b.email, b.phone].filter(Boolean).map(esc).join('<br>')],
    extra ? ['참고', esc(extra)] : null,
    ['신청 번호', esc(b.ref)],
  ]);
  const note = (b.topics || b.prayer) && kind !== 'cancelled' ? '<p style="margin:12px 0 0;font-size:13px;color:#6d7478;">신청자가 나누고 싶은 내용이나 기도 제목을 적었습니다. 개인정보 보호를 위해 메일에는 넣지 않았으니 관리자 화면에서 확인해 주세요.</p>' : '';
  return {
    subject: T.subject,
    html: frame({ appUrl, eyebrow: 'FOR PASTOR', title: T.title, body: rows + note, cta: { href: `${appUrl}/admin/bookings?id=${encodeURIComponent(b.id)}`, label: '관리자 화면에서 보기' } }),
    text: plain([T.title, '', `신청자: ${b.name}${b.group ? ' · ' + b.group : ''}`, `일시: ${fmtDate(b.start)} ${fmtTime(b.start)} – ${fmtTime(b.end)} (${tzAbbr(b.start)})`,
      `만남 방식: ${MODES[b.mode]?.label || ''}`, `장소: ${placeText(b, settings)}`, `연락처: ${[b.email, b.phone].filter(Boolean).join(', ')}`, extra ? `참고: ${extra}` : null, `신청 번호: ${b.ref}`, '', `${appUrl}/admin/bookings?id=${b.id}`]),
  };
}

export function digestMail(list, { settings, appUrl, dateLabel }) {
  const rows = list.map((b) => `<tr><td style="padding:10px 0;border-bottom:1px solid #e2e2de;font-weight:700;white-space:nowrap;vertical-align:top;">${esc(fmtTime(b.start))}</td><td style="padding:10px 0 10px 14px;border-bottom:1px solid #e2e2de;">${esc(b.name)}${b.group ? ` · ${esc(b.group)}` : ''}<br><span style="color:#6d7478;font-size:13px;">${esc(placeText(b, settings))}</span></td></tr>`).join('');
  return {
    subject: `[YES 심방] 내일(${dateLabel}) 심방 ${list.length}건`,
    html: frame({ appUrl, eyebrow: 'TOMORROW', title: `내일 심방 일정 · ${list.length}건`, body: `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:2px solid #112b32;">${rows}</table>`, cta: { href: appUrl + '/admin', label: '대시보드 열기' } }),
    text: plain([`내일(${dateLabel}) 심방 ${list.length}건`, ...list.map((b) => `${fmtTime(b.start)} ${b.name} · ${placeText(b, settings)}`)]),
  };
}

export function testMail({ appUrl }) {
  return { subject: '[YES 심방] 테스트 메일', html: frame({ appUrl, eyebrow: 'TEST', title: '메일 연결이 잘 되었습니다.', body: '<p>이 메일이 보이면 예약 알림 메일이 정상적으로 발송됩니다.</p>' }), text: '메일 연결이 잘 되었습니다.' };
}
