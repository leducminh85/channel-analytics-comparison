const VIDIQ_BEARER_TOKENS = [
  { value: process.env.VIDIQ_BEARER_TOKEN, label: "VIDIQ_BEARER_TOKEN" },
  { value: process.env.VIDIQ_BEARER_TOKEN2, label: "VIDIQ_BEARER_TOKEN2" },
  { value: process.env.VIDIQ_BEARER_TOKEN3, label: "VIDIQ_BEARER_TOKEN3" },
  { value: process.env.VIDIQ_BEARER_TOKEN4, label: "VIDIQ_BEARER_TOKEN4" },
  { value: process.env.VIDIQ_BEARER_TOKEN5, label: "VIDIQ_BEARER_TOKEN5" },
  { value: process.env.VIDIQ_BEARER_TOKEN6, label: "VIDIQ_BEARER_TOKEN6" },
];
const VIDIQ_CLIENT_ID = process.env.VIDIQ_CLIENT_ID;
const VIDIQ_MAX_TOKEN_ATTEMPTS = 2;
const VIDIQ_RATE_LIMIT_COOLDOWN_MS = 30 * 60 * 1000;
const VIDIQ_FAILURE_COOLDOWN_MS = 5 * 60 * 1000;
const VIDIQ_FAILURES_BEFORE_COOLDOWN = 3;
const VIDIQ_STATS_LOOKBACK_DAYS = 365;

interface VidiqToken {
  value: string;
  label: string;
}

interface VidiqTokenState {
  cooldownUntil: number;
  consecutiveFailures: number;
  lastUsedAt: number;
}

class VidiqHttpError extends Error {
  status: number;
  retryAfterMs: number | null;

  constructor(tokenLabel: string, response: Response) {
    super(`VidIQ API Error (${tokenLabel}): ${response.status} ${response.statusText}`);
    this.name = "VidiqHttpError";
    this.status = response.status;
    this.retryAfterMs = getRetryAfterMs(response.headers.get("retry-after"));
  }
}

const vidiqTokenStates = new Map<string, VidiqTokenState>();

interface VidiqStatsResponseItem {
  id: string;
  title?: string;
  thumbnails?: string;
  stats?: VidiqStatsSnapshot[];
}

interface VidiqStatsSnapshot {
  recorded_at: string;
  subscribers: number;
  views: number;
  videos: number;
}

interface NormalizedVidiqStat {
  recordedAt: Date;
  timestampSeconds: number;
  day: string;
  month: string;
  views: number;
  subscribers: number;
  videos: number;
}

interface VidiqDailyStat {
  date_str: string;
  views: number;
  views_change: number;
  subscribers: number;
  subscribers_change: number;
}

interface VidiqMonthlyStat {
  month: string;
  views_gained: number;
  total_views_at_end: number;
  subscribers: number;
  subscribers_change: number;
}

function getConfiguredVidiqTokens() {
  return VIDIQ_BEARER_TOKENS.filter((item): item is VidiqToken => Boolean(item.value));
}

function getTokenState(tokenLabel: string) {
  const existing = vidiqTokenStates.get(tokenLabel);
  if (existing) return existing;

  const state = {
    cooldownUntil: 0,
    consecutiveFailures: 0,
    lastUsedAt: 0,
  };
  vidiqTokenStates.set(tokenLabel, state);
  return state;
}

function getRetryAfterMs(value: string | null) {
  if (!value) return null;

  const seconds = Number(value);
  if (Number.isFinite(seconds)) {
    return Math.max(0, seconds * 1000);
  }

  const retryDate = new Date(value);
  if (!Number.isNaN(retryDate.getTime())) {
    return Math.max(0, retryDate.getTime() - Date.now());
  }

  return null;
}

function getAvailableVidiqTokens(tokens: VidiqToken[]) {
  const now = Date.now();

  return tokens
    .filter((token) => getTokenState(token.label).cooldownUntil <= now)
    .sort((a, b) => {
      const stateA = getTokenState(a.label);
      const stateB = getTokenState(b.label);
      return stateA.lastUsedAt - stateB.lastUsedAt;
    });
}

function markTokenSuccess(tokenLabel: string) {
  const state = getTokenState(tokenLabel);
  state.consecutiveFailures = 0;
  state.cooldownUntil = 0;
}

function markTokenFailure(tokenLabel: string, error: unknown) {
  const state = getTokenState(tokenLabel);
  state.consecutiveFailures += 1;

  if (error instanceof VidiqHttpError && error.status === 429) {
    const cooldownMs = error.retryAfterMs ?? VIDIQ_RATE_LIMIT_COOLDOWN_MS;
    state.cooldownUntil = Date.now() + cooldownMs;
    console.warn(`[VidIQ] ${tokenLabel} is rate limited, cooling down for ${Math.round(cooldownMs / 1000)}s`);
    return;
  }

  if (state.consecutiveFailures >= VIDIQ_FAILURES_BEFORE_COOLDOWN) {
    state.cooldownUntil = Date.now() + VIDIQ_FAILURE_COOLDOWN_MS;
    console.warn(`[VidIQ] ${tokenLabel} had repeated failures, cooling down for ${Math.round(VIDIQ_FAILURE_COOLDOWN_MS / 1000)}s`);
  }
}

function getVidiqClientHeader() {
  const clientId = VIDIQ_CLIENT_ID?.trim();

  if (!clientId || clientId === "YOUR_VIDIQ_CLIENT_ID") {
    return "ext vch/3.200.0";
  }

  return clientId;
}

function formatDateQuery(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getStatsDateRange(now = new Date()) {
  const to = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const from = new Date(to);
  from.setDate(from.getDate() - (VIDIQ_STATS_LOOKBACK_DAYS - 1));

  return {
    from: formatDateQuery(from),
    to: formatDateQuery(to),
  };
}

function toUtcDay(date: Date) {
  return date.toISOString().slice(0, 10);
}

function toUtcMonth(date: Date) {
  return date.toISOString().slice(0, 7);
}

function normalizeSnapshot(snapshot: VidiqStatsSnapshot): NormalizedVidiqStat | null {
  const recordedAt = new Date(snapshot.recorded_at);
  const views = Number(snapshot.views);
  const subscribers = Number(snapshot.subscribers);
  const videos = Number(snapshot.videos);

  if (
    Number.isNaN(recordedAt.getTime()) ||
    !Number.isFinite(views) ||
    !Number.isFinite(subscribers) ||
    !Number.isFinite(videos)
  ) {
    return null;
  }

  return {
    recordedAt,
    timestampSeconds: Math.floor(recordedAt.getTime() / 1000),
    day: toUtcDay(recordedAt),
    month: toUtcMonth(recordedAt),
    views,
    subscribers,
    videos,
  };
}

function getDailySnapshots(stats: VidiqStatsSnapshot[]) {
  const snapshots = stats
    .map(normalizeSnapshot)
    .filter((item): item is NormalizedVidiqStat => Boolean(item))
    .sort((a, b) => a.recordedAt.getTime() - b.recordedAt.getTime());

  const latestByDay = new Map<string, NormalizedVidiqStat>();
  for (const snapshot of snapshots) {
    latestByDay.set(snapshot.day, snapshot);
  }

  return Array.from(latestByDay.values()).sort(
    (a, b) => a.recordedAt.getTime() - b.recordedAt.getTime()
  );
}

function calculateDailyStats(dailySnapshots: NormalizedVidiqStat[]) {
  const dailyStats = dailySnapshots.map<VidiqDailyStat>((snapshot, index) => {
    const previous = dailySnapshots[index - 1];

    return {
      date_str: String(snapshot.timestampSeconds),
      views: snapshot.views,
      views_change: previous ? Math.max(0, snapshot.views - previous.views) : 0,
      subscribers: snapshot.subscribers,
      subscribers_change: previous ? Math.max(0, snapshot.subscribers - previous.subscribers) : 0,
    };
  });

  return dailyStats.sort((a, b) => Number(b.date_str) - Number(a.date_str));
}

function calculateViews30Days(dailyStats: VidiqDailyStat[]) {
  return dailyStats
    .slice(0, 30)
    .reduce((sum, stat) => sum + Math.max(0, stat.views_change), 0);
}

export function calculateMonthlyStats(dailySnapshots: NormalizedVidiqStat[]) {
  if (dailySnapshots.length === 0) return [];

  const monthlyStats: VidiqMonthlyStat[] = [];
  const monthMap = new Map<string, NormalizedVidiqStat[]>();

  for (const snapshot of dailySnapshots) {
    const monthStats = monthMap.get(snapshot.month) ?? [];
    monthStats.push(snapshot);
    monthMap.set(snapshot.month, monthStats);
  }

  const monthKeys = Array.from(monthMap.keys()).sort((a, b) => a.localeCompare(b));
  let previousMonthEnd: NormalizedVidiqStat | null = null;

  for (const month of monthKeys) {
    const snapshots = monthMap.get(month);
    if (!snapshots || snapshots.length === 0) continue;

    const firstSnapshot = snapshots[0];
    const lastSnapshot = snapshots[snapshots.length - 1];
    const baseline = previousMonthEnd ?? firstSnapshot;

    monthlyStats.push({
      month,
      views_gained: Math.max(0, lastSnapshot.views - baseline.views),
      total_views_at_end: lastSnapshot.views,
      subscribers: lastSnapshot.subscribers,
      subscribers_change: Math.max(0, lastSnapshot.subscribers - baseline.subscribers),
    });

    previousMonthEnd = lastSnapshot;
  }

  return monthlyStats.sort((a, b) => b.month.localeCompare(a.month));
}

function getChannelStatsItem(data: unknown, channelId: string): VidiqStatsResponseItem {
  if (!Array.isArray(data)) {
    throw new Error("VidIQ API Error: response is not an array");
  }

  const item = data.find(
    (entry): entry is VidiqStatsResponseItem =>
      Boolean(entry && typeof entry === "object" && "id" in entry && entry.id === channelId)
  ) ?? data[0];

  if (!item || typeof item !== "object" || !("stats" in item) || !Array.isArray(item.stats)) {
    throw new Error("VidIQ API Error: response missing stats data");
  }

  return item as VidiqStatsResponseItem;
}

async function fetchVidiqStatsWithToken(channelId: string, token: string, tokenLabel: string) {
  const { from, to } = getStatsDateRange();
  const url = new URL("https://api.vidiq.com/youtube/channels/public/stats");
  url.searchParams.set("ids", channelId);
  url.searchParams.set("from", from);
  url.searchParams.set("to", to);

  const response = await fetch(url, {
    cache: "no-store",
    headers: {
      "accept": "*/*",
      "authorization": `Bearer ${token}`,
      "x-vidiq-client": getVidiqClientHeader(),
    },
  });

  if (!response.ok) {
    throw new VidiqHttpError(tokenLabel, response);
  }

  const data = await response.json();
  const channelData = getChannelStatsItem(data, channelId);
  const rawStats = channelData.stats ?? [];

  if (rawStats.length === 0) {
    throw new Error(`VidIQ API Error (${tokenLabel}): response missing stats data`);
  }

  const dailySnapshots = getDailySnapshots(rawStats);
  const dailyStats = calculateDailyStats(dailySnapshots);
  const monthlyStats = calculateMonthlyStats(dailySnapshots);
  const views30Days = calculateViews30Days(dailyStats);

  if (dailyStats.length === 0 && monthlyStats.length === 0) {
    throw new Error(`VidIQ API Error (${tokenLabel}): response missing usable stats data`);
  }

  console.log(`[VidIQ] Fetched ${rawStats.length} snapshots, ${dailyStats.length} daily stats and ${monthlyStats.length} monthly stats for channel ${channelId} using ${tokenLabel} (${from} to ${to})`);

  return {
    views30Days: Math.round(views30Days),
    dailyStats,
    monthlyStats,
  };
}

export async function getVidiqStats(channelId: string) {
  const tokens = getConfiguredVidiqTokens();

  if (tokens.length === 0) {
    throw new Error("Thieu cau hinh VIDIQ_BEARER_TOKEN trong .env");
  }

  const tokenOrder = getAvailableVidiqTokens(tokens).slice(0, VIDIQ_MAX_TOKEN_ATTEMPTS);
  let lastError: unknown;

  if (tokenOrder.length === 0) {
    throw new Error("Tat ca VidIQ token dang tam nghi do rate limit, vui long thu lai sau.");
  }

  for (const token of tokenOrder) {
    const state = getTokenState(token.label);
    state.lastUsedAt = Date.now();

    try {
      const result = await fetchVidiqStatsWithToken(channelId, token.value, token.label);
      markTokenSuccess(token.label);
      return result;
    } catch (error) {
      lastError = error;
      markTokenFailure(token.label, error);
      console.error(`[VidIQ] Failed with ${token.label} for channel ${channelId}:`, error);
    }
  }

  console.error(`[VidIQ] Exhausted available token attempts for channel ${channelId}`, lastError);
  throw new Error("Đã có lỗi xảy ra, vui lòng thử lại sau ít phút");
}
