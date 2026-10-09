import { SiteHead } from '@/components/Site';
import BookFlow from '@/components/BookFlow';

export const metadata = { title: 'YES 심방 신청' };
export default function Page() {
  return (<><SiteHead /><BookFlow step="details" /></>);
}
