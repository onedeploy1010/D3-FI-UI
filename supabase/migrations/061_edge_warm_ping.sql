-- Keep the hot edge functions warm and their 5-min caches always fresh, so
-- users never pay the cold-start (~5s) or the cache-rebuild (leaderboard =
-- 25-50 external Polymarket calls) themselves:
--   * ai/agents/platform    — AI 站 agents 列表 + ai-hub-status cache
--   * polymarket/leaderboard — CopyTrade 交易员榜单 cache
--   * union/profile/<demo>  — 合伙人 团队/推荐 bundle (keeps union warm)
-- The embedded key is the PUBLIC publishable key (already shipped in the
-- client bundle); pinging every 4 min keeps instances warm and refreshes the
-- 5-min DB caches just before they expire.

do $$ begin
  perform cron.unschedule('d3-edge-warm-ping');
exception when others then null;
end $$;

select cron.schedule(
  'd3-edge-warm-ping',
  '*/4 * * * *',
  $JOB$
  select
    net.http_get(
      url := 'https://fbykfczfshcmfekdmrfp.supabase.co/functions/v1/ai/agents/platform',
      headers := jsonb_build_object('apikey', 'sb_publishable_ToOtnOV0ewmzAGAVijklfw_i35DB5xy', 'Authorization', 'Bearer sb_publishable_ToOtnOV0ewmzAGAVijklfw_i35DB5xy')),
    net.http_get(
      url := 'https://fbykfczfshcmfekdmrfp.supabase.co/functions/v1/polymarket/leaderboard?type=all',
      headers := jsonb_build_object('apikey', 'sb_publishable_ToOtnOV0ewmzAGAVijklfw_i35DB5xy', 'Authorization', 'Bearer sb_publishable_ToOtnOV0ewmzAGAVijklfw_i35DB5xy')),
    net.http_get(
      url := 'https://fbykfczfshcmfekdmrfp.supabase.co/functions/v1/union/profile/0x1234567890abcdef1234567890abcdef12345678',
      headers := jsonb_build_object('apikey', 'sb_publishable_ToOtnOV0ewmzAGAVijklfw_i35DB5xy', 'Authorization', 'Bearer sb_publishable_ToOtnOV0ewmzAGAVijklfw_i35DB5xy'))
  $JOB$
);
