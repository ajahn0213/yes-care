import { SiteHead, SiteFoot } from '@/components/Site';
import Manage from '@/components/Manage';

export const metadata = { title: 'YES 심방 예약 관리', referrer: 'no-referrer' };
export default async function Page({ params }) {
  const { token } = await params;
  return (<><SiteHead /><Manage token={token} /><SiteFoot /></>);
}
