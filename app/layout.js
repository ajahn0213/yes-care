import 'pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css';
import '@fontsource-variable/libre-franklin/wght.css';
import '@fontsource/noto-serif-kr/600.css';
import './globals.css';

export const metadata = {
  title: 'YES 심방 · 마음을 방문하는 시간',
  description: '남가주 사랑의교회 YES 청년부 심방 신청 — 목사님과 삶과 신앙을 나누는 한 시간.',
  robots: { index: false, follow: false },
};
export const viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover', themeColor: '#ffffff' };

export default function RootLayout({ children }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
