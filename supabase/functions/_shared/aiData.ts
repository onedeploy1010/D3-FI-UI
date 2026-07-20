// AI-analytics data layer for Supabase Edge Functions (Deno).
// Ported from server/services/ai-db.ts — same tables, same shapes, adapted to
// the Deno service-role client and a wallet-string (not express Request) API.
import { getSupabaseAdmin } from './supabase.ts';

export const DEMO_WALLET = '0x1234567890abcdef1234567890abcdef12345678';

export function requireSupabase() {
  return getSupabaseAdmin();
}

export function isSupabaseConfigured(): boolean {
  return Boolean(Deno.env.get('SUPABASE_URL') && Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'));
}

export function normalizeWallet(wallet: string) {
  return wallet.trim().toLowerCase();
}

/** Resolve the caller wallet from an `x-wallet-address` header or `?wallet=`. */
export function walletFromRequest(req: Request): string {
  const header = req.headers.get('x-wallet-address') ?? undefined;
  const fromQuery = new URL(req.url).searchParams.get('wallet') ?? undefined;
  return normalizeWallet(fromQuery ?? header ?? DEMO_WALLET);
}

function shortAddress(wallet: string) {
  const w = wallet.trim();
  if (w.length < 12) return w;
  return `${w.slice(0, 6)}…${w.slice(-4)}`;
}

export async function getOrCreateProfile(wallet: string) {
  const sb = requireSupabase();
  const normalized = normalizeWallet(wallet);

  const { data: existing } = await sb
    .from('profiles')
    .select('wallet_address, display_name')
    .ilike('wallet_address', normalized)
    .maybeSingle();

  if (existing) return existing;

  const { data: created, error } = await sb
    .from('profiles')
    .insert({
      wallet_address: normalized,
      display_name: 'AlphaTrader',
      short_address: shortAddress(normalized),
      lang: 'zh',
    })
    .select('wallet_address, display_name')
    .single();

  if (error) throw error;
  return created;
}

export async function getOrCreateAiAccount(wallet: string) {
  const sb = requireSupabase();
  const normalized = normalizeWallet(wallet);

  const { data: existing } = await sb
    .from('ai_user_accounts')
    .select('*')
    .eq('wallet_address', normalized)
    .maybeSingle();

  if (existing) return existing;

  const { data: created, error } = await sb
    .from('ai_user_accounts')
    .insert({ wallet_address: normalized })
    .select('*')
    .single();

  if (error) throw error;
  return created;
}

export async function resolveUser(wallet: string) {
  const normalized = normalizeWallet(wallet);
  const profile = await getOrCreateProfile(normalized);
  const account = await getOrCreateAiAccount(normalized);
  return { wallet: normalized, profile, account };
}

// ── Strategies ───────────────────────────────────────────────────────────────

export async function listPlatformStrategies() {
  const sb = requireSupabase();
  const { data, error } = await sb
    .from('platform_strategies')
    .select('*')
    .eq('is_active', true)
    .order('sort_order');
  if (error) throw error;
  return (data ?? []).map(mapStrategyRow);
}

function mapStrategyRow(row: Record<string, unknown>) {
  return {
    id: row.id,
    name: row.name,
    author: row.author,
    description: row.description,
    longDesc: row.long_desc,
    category: row.category,
    riskLevel: row.risk_level,
    tokenCost: row.token_cost,
    winRate: Number(row.win_rate),
    roi90d: Number(row.roi_90d),
    maxDrawdown: Number(row.max_drawdown),
    subscribers: row.subscribers,
    isAI: row.is_ai,
    tags: row.tags ?? [],
    features: row.features ?? [],
    scope: 'platform' as const,
  };
}

export async function getUserStrategies(userId: string) {
  const sb = requireSupabase();
  const [account, ownedRows, catalog] = await Promise.all([
    getOrCreateAiAccount(userId),
    sb.from('user_strategies').select('strategy_id, tokens_spent, purchased_at').eq('wallet_address', userId),
    listPlatformStrategies(),
  ]);

  if (ownedRows.error) throw ownedRows.error;

  const ownedIds = (ownedRows.data ?? []).map((r) => r.strategy_id as string);
  const owned = catalog.filter((s) => ownedIds.includes(s.id as string)).map((s) => ({ ...s, scope: 'user' as const }));

  return {
    ownedIds,
    owned,
    knowledgeBase: account.knowledge_base_ids ?? [],
    tokens: account.tokens ?? 0,
    scope: 'user' as const,
  };
}

export async function purchaseStrategy(userId: string, strategyId: string) {
  const sb = requireSupabase();
  const catalog = await listPlatformStrategies();
  const strategy = catalog.find((s) => s.id === strategyId);
  if (!strategy) throw new Error('Strategy not found');

  const account = await getOrCreateAiAccount(userId);
  const { data: existing } = await sb
    .from('user_strategies')
    .select('id')
    .eq('wallet_address', userId)
    .eq('strategy_id', strategyId)
    .maybeSingle();

  if (existing) return { ok: true, alreadyOwned: true, tokens: account.tokens };

  if ((account.tokens ?? 0) < (strategy.tokenCost as number)) {
    throw new Error('Insufficient tokens');
  }

  const newTokens = (account.tokens ?? 0) - (strategy.tokenCost as number);

  await sb.from('ai_user_accounts').update({ tokens: newTokens }).eq('wallet_address', userId);
  await sb.from('user_strategies').insert({
    wallet_address: userId,
    strategy_id: strategyId,
    tokens_spent: strategy.tokenCost,
  });

  const { data: owned } = await sb.from('user_strategies').select('strategy_id').eq('wallet_address', userId);
  return { ok: true, tokens: newTokens, ownedIds: (owned ?? []).map((r) => r.strategy_id) };
}

export async function updateUserStrategyMeta(
  userId: string,
  patch: { knowledgeBase?: string[]; tokens?: number },
) {
  const sb = requireSupabase();
  const update: Record<string, unknown> = {};
  if (patch.knowledgeBase) update.knowledge_base_ids = patch.knowledgeBase;
  if (patch.tokens !== undefined) update.tokens = patch.tokens;
  const { data, error } = await sb
    .from('ai_user_accounts')
    .update(update)
    .eq('wallet_address', userId)
    .select('knowledge_base_ids, tokens')
    .single();
  if (error) throw error;
  return data;
}

// ── Agents ───────────────────────────────────────────────────────────────────

export async function listPlatformAgents(type?: 'fleet' | 'copytrade') {
  const sb = requireSupabase();
  let q = sb.from('platform_agents').select('*').eq('is_active', true).order('sort_order');
  if (type) q = q.eq('agent_type', type);
  const { data, error } = await q;
  if (error) throw error;
  return data ?? [];
}

export async function getPlatformAgentsWithStatus(type: 'fleet' | 'copytrade' = 'fleet') {
  const agents = await listPlatformAgents(type);
  const sb = requireSupabase();

  const enriched = await Promise.all(
    agents.map(async (a) => {
      const { data: status } = await sb
        .from('platform_agent_status')
        .select('*')
        .eq('agent_id', a.id)
        .order('recorded_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (type === 'copytrade') {
        return {
          id: a.id,
          name: a.name,
          description: a.description,
          riskLevel: a.risk_level,
          winRate: Number(a.win_rate ?? 0),
          avgRoi: Number(a.avg_roi ?? 0),
          maxDrawdown: Number(a.max_drawdown ?? 0),
          signals: a.signals_count ?? 0,
          style: a.style,
          features: a.features ?? [],
          scope: 'platform',
        };
      }

      return {
        id: a.id,
        name: a.name,
        role: a.role,
        description: a.description,
        riskLevel: a.risk_level,
        capabilities: a.capabilities ?? [],
        scope: 'platform',
        status: status?.status ?? 'active',
        accuracy: status?.accuracy ?? 80,
        epoch: status?.epoch ?? 500,
        insight: status?.insight ?? '',
      };
    }),
  );

  return enriched;
}

export async function savePlatformAgentStatus(
  agentId: string,
  status: { status: string; accuracy: number; insight?: string; epoch?: number },
) {
  const sb = requireSupabase();
  await sb.from('platform_agent_status').insert({
    agent_id: agentId,
    status: status.status,
    accuracy: status.accuracy,
    insight: status.insight,
    epoch: status.epoch,
  });
}

export async function getUserAgents(userId: string) {
  const sb = requireSupabase();
  const { data, error } = await sb.from('user_agents').select('*').eq('wallet_address', userId);
  if (error) throw error;
  return (data ?? []).map(mapUserAgentRow);
}

export async function saveUserAgents(userId: string, agents: Record<string, unknown>[]) {
  const sb = requireSupabase();
  await sb.from('user_agents').delete().eq('wallet_address', userId);
  if (agents.length === 0) return [];

  const rows = agents.map((a) => ({
    id: a.id,
    wallet_address: userId,
    name: a.name,
    strategy: a.strategy,
    model: a.model,
    score: a.score ?? 0,
    win_rate: a.winRate ?? a.win_rate ?? 0,
    backtest_pnl: a.backtestPnl ?? a.backtest_pnl ?? 0,
    backtest_pnl_pct: a.backtestPnlPct ?? a.backtest_pnl_pct ?? 0,
    max_drawdown: a.maxDrawdown ?? a.max_drawdown ?? 0,
    sharpe_ratio: a.sharpeRatio ?? a.sharpe_ratio ?? 0,
    trades: a.trades ?? 0,
    risk_level: a.riskLevel ?? a.risk_level ?? 'medium',
    is_candidate: a.isCandidate ?? a.is_candidate ?? false,
    trained_at: a.trainedAt ?? a.trained_at,
    deployed_at: a.deployedAt ?? a.deployed_at,
    sim_status: a.simStatus ?? a.sim_status,
    sim_started_at: a.simStartedAt ?? a.sim_started_at,
    sim_pnl_pct: a.simPnlPct ?? a.sim_pnl_pct,
    sim_win_rate: a.simWinRate ?? a.sim_win_rate,
    metadata: a.metadata ?? {},
  }));

  const { data, error } = await sb.from('user_agents').insert(rows).select('*');
  if (error) throw error;
  return (data ?? []).map(mapUserAgentRow);
}

function mapUserAgentRow(row: Record<string, unknown>) {
  return {
    id: row.id,
    name: row.name,
    strategy: row.strategy,
    model: row.model,
    score: Number(row.score),
    winRate: Number(row.win_rate),
    backtestPnl: Number(row.backtest_pnl),
    backtestPnlPct: Number(row.backtest_pnl_pct),
    maxDrawdown: Number(row.max_drawdown),
    sharpeRatio: Number(row.sharpe_ratio),
    trades: row.trades,
    riskLevel: row.risk_level,
    isCandidate: row.is_candidate,
    trainedAt: row.trained_at,
    deployedAt: row.deployed_at,
    simStatus: row.sim_status,
    simStartedAt: row.sim_started_at,
    simPnlPct: row.sim_pnl_pct,
    simWinRate: row.sim_win_rate,
  };
}

// ── Simulations ──────────────────────────────────────────────────────────────

export async function listSimRuns(userId?: string) {
  const sb = requireSupabase();
  let q = sb.from('simulation_runs').select('*').order('started_at', { ascending: false });
  if (userId) q = q.eq('wallet_address', userId);
  const { data, error } = await q.limit(20);
  if (error) throw error;
  return (data ?? []).map((r, i) => ({
    id: i + 1,
    name: r.name,
    status: r.status,
    accuracy: Number(r.accuracy ?? 0),
    epochs: r.epochs ?? 0,
  }));
}

export async function listSimLeaderboard() {
  const sb = requireSupabase();
  const { data, error } = await sb.from('sim_leaderboard').select('*').order('rank');
  if (error) throw error;
  return (data ?? []).map((r) => ({
    rank: r.rank,
    name: r.name,
    score: Number(r.score),
    pnl: Number(r.pnl),
  }));
}

// ── Copy trade ───────────────────────────────────────────────────────────────

export async function getCopytradeExchanges(userId: string) {
  const sb = requireSupabase();
  const { data, error } = await sb.from('copytrade_exchanges').select('*').eq('wallet_address', userId);
  if (error) throw error;
  return (data ?? []).map((r) => ({
    id: r.id,
    name: r.name,
    slug: r.slug,
    tradingEnabled: r.trading_enabled,
    apiKeyMasked: r.api_key_masked,
    isConnected: r.is_connected,
    balance: Number(r.balance),
    exchange: r.exchange,
  }));
}

export async function updateCopytradeExchange(
  userId: string,
  id: number,
  patch: Record<string, unknown>,
) {
  const sb = requireSupabase();
  const update: Record<string, unknown> = {};
  if (patch.tradingEnabled !== undefined) update.trading_enabled = patch.tradingEnabled;
  if (patch.isConnected !== undefined) update.is_connected = patch.isConnected;
  if (patch.apiKeyMasked !== undefined) update.api_key_masked = patch.apiKeyMasked;
  if (patch.apiKeyLabel !== undefined) update.name = patch.apiKeyLabel;
  if (patch.balance !== undefined) update.balance = patch.balance;
  if (Object.keys(update).length === 0) return { ok: true, id };
  const { error } = await sb
    .from('copytrade_exchanges')
    .update(update)
    .eq('wallet_address', userId)
    .eq('id', id);
  if (error) throw error;
  return { ok: true, id };
}

export async function deleteCopytradeExchange(userId: string, id: number) {
  const sb = requireSupabase();
  const { error } = await sb.from('copytrade_exchanges').delete().eq('wallet_address', userId).eq('id', id);
  if (error) throw error;
  return { ok: true, id };
}

export async function getCopytradeConfigs(userId: string) {
  const sb = requireSupabase();
  const { data, error } = await sb.from('copytrade_configs').select('*').eq('wallet_address', userId);
  if (error) throw error;
  return (data ?? []).map(mapConfigRow);
}

function mapConfigRow(r: Record<string, unknown>) {
  return {
    id: r.id,
    name: r.name,
    allocationPercent: Number(r.allocation_percent),
    maxLeverage: r.max_leverage,
    isActive: r.is_active,
    exchangeId: r.exchange_id,
    stopLossPercent: Number(r.stop_loss_percent),
    takeProfitPercent: Number(r.take_profit_percent),
  };
}

function configPatchToRow(userId: string, data: Record<string, unknown>) {
  const row: Record<string, unknown> = {};
  if (userId) row.wallet_address = userId;
  if (data.name !== undefined) row.name = data.name;
  if (data.allocationPercent !== undefined) row.allocation_percent = data.allocationPercent;
  if (data.maxLeverage !== undefined) row.max_leverage = data.maxLeverage;
  if (data.isActive !== undefined) row.is_active = data.isActive;
  if (data.exchangeId !== undefined) row.exchange_id = data.exchangeId;
  if (data.traderAddress !== undefined) row.trader_address = data.traderAddress;
  if (data.stopLossPercent !== undefined) row.stop_loss_percent = data.stopLossPercent;
  if (data.takeProfitPercent !== undefined) row.take_profit_percent = data.takeProfitPercent;
  return row;
}

export async function createCopytradeConfig(userId: string, data: Record<string, unknown>) {
  const sb = requireSupabase();
  const row = configPatchToRow(userId, data);
  const { data: created, error } = await sb.from('copytrade_configs').insert(row).select('*').single();
  if (error) throw error;
  return mapConfigRow(created);
}

export async function updateCopytradeConfig(userId: string, id: number, data: Record<string, unknown>) {
  const sb = requireSupabase();
  const row = configPatchToRow('', data);
  const { data: updated, error } = await sb
    .from('copytrade_configs')
    .update(row)
    .eq('wallet_address', userId)
    .eq('id', id)
    .select('*')
    .maybeSingle();
  if (error) throw error;
  return updated ? mapConfigRow(updated) : { ok: true, id };
}

export async function deleteCopytradeConfig(userId: string, id: number) {
  const sb = requireSupabase();
  const { error } = await sb.from('copytrade_configs').delete().eq('wallet_address', userId).eq('id', id);
  if (error) throw error;
  return { ok: true, id };
}

export async function getCopytradeStats(userId: string) {
  const sb = requireSupabase();
  const { data } = await sb.from('copytrade_stats').select('*').eq('wallet_address', userId).maybeSingle();
  return {
    totalPnl: Number(data?.total_pnl ?? 0),
    winRate: Number(data?.win_rate ?? 0),
    activeConfigs: data?.active_configs ?? 0,
    totalTrades: data?.total_trades ?? 0,
    sharpeRatio: Number(data?.sharpe_ratio ?? 0),
    maxDrawdown: Number(data?.max_drawdown ?? 0),
  };
}

export async function getCopytradeOrders(userId: string, limit = 50) {
  const sb = requireSupabase();
  const { data, error } = await sb
    .from('copytrade_orders')
    .select('*')
    .eq('wallet_address', userId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []).map((r) => ({
    id: r.id,
    symbol: r.symbol,
    side: r.side,
    type: r.order_type,
    status: r.status,
    pnl: Number(r.pnl ?? 0),
    price: Number(r.price ?? 0),
    quantity: Number(r.quantity ?? 0),
    aiScore: r.ai_score,
    aiReason: r.ai_reason,
    createdAt: r.created_at,
  }));
}

export async function cancelCopytradeOrder(userId: string, id: number) {
  const sb = requireSupabase();
  const { error } = await sb
    .from('copytrade_orders')
    .update({ status: 'cancelled' })
    .eq('wallet_address', userId)
    .eq('id', id);
  if (error) throw error;
  return { ok: true, id };
}

// ── Signals ──────────────────────────────────────────────────────────────────

export async function saveSignals(userId: string, signals: Record<string, unknown>[]) {
  const sb = requireSupabase();
  if (signals.length === 0) return [];
  const rows = signals.map((s) => ({
    wallet_address: userId,
    symbol: s.symbol,
    direction: s.direction,
    confidence: s.confidence,
    source: s.source,
    reason: s.reason,
    status: s.status ?? 'active',
    pnl: s.pnl,
  }));
  const { data, error } = await sb.from('trading_signals').insert(rows).select('*');
  if (error) throw error;
  return data ?? [];
}

export async function listSignals(userId: string, limit = 20) {
  const sb = requireSupabase();
  const { data, error } = await sb
    .from('trading_signals')
    .select('*')
    .eq('wallet_address', userId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []).map((r) => ({
    id: r.id,
    symbol: r.symbol,
    direction: r.direction,
    confidence: Number(r.confidence),
    source: r.source,
    reason: r.reason,
    timestamp: r.created_at,
    status: r.status,
    pnl: r.pnl,
  }));
}

// ── Notifications ────────────────────────────────────────────────────────────

export async function listNotifications(userId: string, unreadOnly = false) {
  const sb = requireSupabase();
  let q = sb.from('ai_notifications').select('*').eq('wallet_address', userId).order('created_at', { ascending: false });
  if (unreadOnly) q = q.eq('is_read', false);
  const { data, error } = await q.limit(50);
  if (error) throw error;
  return (data ?? []).map((r) => ({
    id: r.id,
    title: r.title,
    message: r.message,
    type: r.type,
    symbol: r.symbol,
    isRead: r.is_read,
    createdAt: r.created_at,
  }));
}

export async function markNotificationRead(userId: string, id: number) {
  const sb = requireSupabase();
  const { error } = await sb
    .from('ai_notifications')
    .update({ is_read: true })
    .eq('wallet_address', userId)
    .eq('id', id);
  if (error) throw error;
  return { ok: true, id };
}

// ── Notification channels ────────────────────────────────────────────────────

export async function listNotificationChannels(userId: string) {
  const sb = requireSupabase();
  const { data, error } = await sb.from('notification_channels').select('*').eq('wallet_address', userId);
  if (error) throw error;
  return data ?? [];
}

export async function addNotificationChannel(userId: string, channel: Record<string, unknown>) {
  const sb = requireSupabase();
  const { data, error } = await sb
    .from('notification_channels')
    .insert({ wallet_address: userId, channel_type: channel.channelType ?? channel.type ?? 'webhook', config: channel })
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

export async function updateNotificationChannel(
  userId: string,
  id: number | string,
  patch: Record<string, unknown>,
) {
  const sb = requireSupabase();
  const update: Record<string, unknown> = {};
  if (patch.enabled !== undefined) update.enabled = patch.enabled;
  if (patch.config !== undefined) update.config = patch.config;
  const { data, error } = await sb
    .from('notification_channels')
    .update(update)
    .eq('wallet_address', userId)
    .eq('id', id)
    .select('*')
    .maybeSingle();
  if (error) throw error;
  return data ?? { ok: true, id };
}

export async function deleteNotificationChannel(userId: string, id: number | string) {
  const sb = requireSupabase();
  const { error } = await sb.from('notification_channels').delete().eq('wallet_address', userId).eq('id', id);
  if (error) throw error;
  return { ok: true, id };
}

// ── Profile ──────────────────────────────────────────────────────────────────

export async function getUserProfile(userId: string) {
  const account = await getOrCreateAiAccount(userId);
  return {
    username: account.username,
    avatarUrl: account.avatar_url ?? '',
    rank: account.rank_label,
    alphaScore: account.alpha_score,
  };
}

export async function getUserPreferences(wallet: string) {
  const account = await getOrCreateAiAccount(wallet);
  return (account.preferences ?? {}) as Record<string, unknown>;
}

export async function patchUserPreferences(wallet: string, patch: Record<string, unknown>) {
  const sb = requireSupabase();
  const current = await getUserPreferences(wallet);
  const next = { ...current, ...patch };
  const { data, error } = await sb
    .from('ai_user_accounts')
    .update({ preferences: next })
    .eq('wallet_address', normalizeWallet(wallet))
    .select('preferences')
    .single();
  if (error) throw error;
  return (data.preferences ?? {}) as Record<string, unknown>;
}

// ── Cache ────────────────────────────────────────────────────────────────────

export async function getCache(key: string) {
  const sb = requireSupabase();
  const { data } = await sb
    .from('market_analysis_cache')
    .select('payload, expires_at')
    .eq('cache_key', key)
    .maybeSingle();
  if (!data) return null;
  if (new Date(data.expires_at) < new Date()) return null;
  return data.payload;
}

export async function setCache(key: string, payload: unknown, ttlMs: number) {
  const sb = requireSupabase();
  const expires_at = new Date(Date.now() + ttlMs).toISOString();
  await sb.from('market_analysis_cache').upsert({ cache_key: key, payload, expires_at });
}

export async function clearCacheLike(prefix: string) {
  const sb = requireSupabase();
  await sb.from('market_analysis_cache').delete().like('cache_key', `${prefix}%`);
}

// ── Chat ─────────────────────────────────────────────────────────────────────

export async function saveChatMessage(userId: string, agentId: string, role: string, content: string) {
  const sb = requireSupabase();
  await sb.from('ai_chat_messages').insert({ wallet_address: userId, agent_id: agentId, role, content });
}

// ── AI Hub snapshot ──────────────────────────────────────────────────────────

export async function saveAiHubSnapshot(snapshot: Record<string, unknown>) {
  const sb = requireSupabase();
  await sb.from('ai_hub_snapshots').insert({
    active_agents: snapshot.activeAgents,
    total_epochs: snapshot.totalEpochs,
    avg_accuracy: snapshot.avgAccuracy,
    system_health: snapshot.systemHealth,
    learning_progress: snapshot.learningProgress,
    total_sim_accounts: snapshot.totalSimAccounts,
    fear_greed_index: snapshot.fearGreedIndex,
    metadata: snapshot,
  });
}

export async function getLatestAiHubSnapshot() {
  const sb = requireSupabase();
  const { data } = await sb
    .from('ai_hub_snapshots')
    .select('*')
    .order('recorded_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) return null;
  return {
    activeAgents: data.active_agents,
    totalEpochs: data.total_epochs,
    avgAccuracy: Number(data.avg_accuracy),
    systemHealth: data.system_health,
    learningProgress: Number(data.learning_progress),
    totalSimAccounts: data.total_sim_accounts,
    fearGreedIndex: data.fear_greed_index,
    source: 'remote',
  };
}
