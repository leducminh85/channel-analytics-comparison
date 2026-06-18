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

interface VidiqDailyStat {
  date: number | string;
  views: number;
  views_change: number;
  subscribers: number;
  subscribers_change: number;
}

interface VidiqMonthlyRawStat {
  date?: number | string | null;
  views?: number;
  views_change?: number;
  subscribers?: number;
  subscribers_change?: number;
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

/**
 * Derive monthly aggregates from raw VidIQ data using the existing Python-compatible logic.
 */
export function calculateMonthlyStats(monthlyRaw: VidiqMonthlyRawStat[], currentTotalViews: number, currentSubsCount: number) {
  if (!monthlyRaw || monthlyRaw.length === 0) return [];

  const monthlyStats: VidiqMonthlyStat[] = [];

  monthlyRaw.forEach((stat) => {
    const ts = stat.date;
    if (ts) {
      const timestamp = Number(ts);
      if (Number.isNaN(timestamp)) {
        return;
      }

      const dt = new Date(timestamp * 1000);

      // Shift the month backward by two months to mirror the legacy Python logic.
      let newMonth = (dt.getUTCMonth() + 1) - 2;
      let newYear = dt.getUTCFullYear();

      if (newMonth <= 0) {
        newMonth += 12;
        newYear -= 1;
      }

      const monthStr = `${newYear}-${newMonth.toString().padStart(2, "0")}`;

      monthlyStats.push({
        month: monthStr,
        views_gained: stat.views_change || 0,
        total_views_at_end: stat.views || 0,
        subscribers: stat.subscribers || 0,
        subscribers_change: stat.subscribers_change || 0
      });
    }
  });

  // Keep the most recent month at the front of the array.
  monthlyStats.sort((a, b) => b.month.localeCompare(a.month));

  // Add the current month when the API payload stops at the previous month.
  if (monthlyStats.length > 0) {
    const latestItem = monthlyStats[0];
    const latestMonthStr = latestItem.month;
    const latestTotalViews = latestItem.total_views_at_end;

    const [y, m] = latestMonthStr.split("-").map(Number);
    let nextM = m + 1;
    let nextY = y;

    if (nextM > 12) {
      nextM = 1;
      nextY += 1;
    }

    const nextMonthStr = `${nextY}-${nextM.toString().padStart(2, "0")}`;

    if (nextMonthStr !== latestMonthStr) {
      const nextViewsGained = Math.max(0, currentTotalViews - latestTotalViews);

      // Insert the inferred current month at the beginning of the list.
      monthlyStats.unshift({
        month: nextMonthStr,
        views_gained: nextViewsGained,
        total_views_at_end: currentTotalViews,
        subscribers: currentSubsCount,
        subscribers_change: 0
      });
    }
  }

  // Ensure the final result remains sorted newest-first.
  return monthlyStats.sort((a, b) => b.month.localeCompare(a.month));
}

async function fetchVidiqStatsWithToken(channelId: string, token: string, tokenLabel: string) {
  const url = `https://api.vidiq.com/youtube/channels/public/channel-pages/${channelId}`;

  const response = await fetch(url, {
    headers: {
      "accept": "*/*",
      "authorization": `Bearer ${token}`,
      "content-type": "application/json",
      "user-agent": "Mozilla/5.0",
      "x-vidiq-client": VIDIQ_CLIENT_ID || "ext vch/3.168.0",
    },
  });

  if (!response.ok) {
    throw new VidiqHttpError(tokenLabel, response);
  }

  const data = await response.json();
  const dailyData: VidiqDailyStat[] = Array.isArray(data.daily_stats) ? data.daily_stats : [];
  const monthlyRaw = Array.isArray(data.monthly_stats) ? data.monthly_stats : [];

  if (dailyData.length === 0 && monthlyRaw.length === 0) {
    throw new Error(`VidIQ API Error (${tokenLabel}): response missing stats data`);
  }

  const currentTotalViews = data.current_stats?.views?.count || 0;
  const currentSubsCount = data.current_stats?.subscribers?.count || 0;

  let views30Days = 0;
  if (dailyData.length >= 2) {
    const yesterdayTotalViews = dailyData[1]?.views || 0;
    const viewsTodayRealtime = Math.max(0, currentTotalViews - yesterdayTotalViews);
    const past29DaysStats = dailyData.slice(1, 30);
    const viewsPast29Days = past29DaysStats.reduce(
      (sum, day) => sum + (day.views_change || 0),
      0
    );
    views30Days = viewsTodayRealtime + viewsPast29Days;
  }

  const dailyStats = dailyData.map((item) => ({
    date_str: String(item.date),
    views: item.views,
    views_change: item.views_change,
    subscribers: item.subscribers,
    subscribers_change: item.subscribers_change,
  }));

  const monthlyStats = calculateMonthlyStats(monthlyRaw, currentTotalViews, currentSubsCount);

  console.log(`[VidIQ] Fetched ${dailyStats.length} daily stats and ${monthlyRaw.length} monthly stats for channel ${channelId} using ${tokenLabel}`);

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
