import { useEffect } from 'react';
import { useLocation } from 'wouter';
import { captureReferralFromUrl } from '@/lib/referral';

/** /r/0x… (and legacy /union/r/0x…) — capture sponsor then redirect to Portal */
export function ReferralLanding() {
  const [, navigate] = useLocation();

  useEffect(() => {
    captureReferralFromUrl();
    navigate('/portal');
  }, [navigate]);

  return null;
}
