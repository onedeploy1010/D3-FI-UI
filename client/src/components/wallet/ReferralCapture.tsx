import { useEffect } from 'react';
import { captureReferralFromUrl } from '@/lib/referral';

/** Capture ?ref= on any route so Portal can bind after wallet login */
export function ReferralCapture() {
  useEffect(() => {
    captureReferralFromUrl();
  }, []);
  return null;
}
