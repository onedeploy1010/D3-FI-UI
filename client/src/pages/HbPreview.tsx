import { PrivateSaleHeartbeat } from '@/components/partner/PrivateSaleHeartbeat';
import NotFound from '@/pages/NotFound';

/**
 * Dev-only preview harness for the 私募心跳指数 widget so it can be viewed in
 * isolation (the real placement in the 质押 tab is gated behind a bound wallet).
 * Guarded to DEV — this route 404s in production builds.
 */
export default function HbPreview() {
  if (!import.meta.env.DEV) return <NotFound />;
  return (
    <div className="min-h-screen bg-[#0d0409] py-8 px-4 flex justify-center">
      <div className="w-full max-w-sm">
        <PrivateSaleHeartbeat lang="zh-CN" isDark />
      </div>
    </div>
  );
}
