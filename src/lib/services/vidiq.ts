const VIDIQ_BEARER_TOKEN = process.env.VIDIQ_BEARER_TOKEN;
const VIDIQ_CLIENT_ID = process.env.VIDIQ_CLIENT_ID;

interface VidiqDailyStat {
  date: any;
  views: number;
  views_change: number;
  subscribers: number;
  subscribers_change: number;
}

/**
 * Derive monthly aggregates from raw VidIQ data using the existing Python-compatible logic.
 */
export function calculateMonthlyStats(monthlyRaw: any[], currentTotalViews: number, currentSubsCount: number) {
  if (!monthlyRaw || monthlyRaw.length === 0) return [];

  const monthlyStats: any[] = [];

  monthlyRaw.forEach((stat) => {
    const ts = stat.date;
    if (ts) {
      const dt = new Date(ts * 1000);

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

export async function getVidiqStats(channelId: string) {
  if (!VIDIQ_BEARER_TOKEN) {
    throw new Error("Thiáº¿u cáº¥u hÃ¬nh VIDIQ_BEARER_TOKEN trong .env");
  }

  const url = `https://api.vidiq.com/youtube/channels/public/channel-pages/${channelId}?days=730`;

  const response = await fetch(url, {
    headers: {
      "accept": "*/*",
      "authorization": `Bearer ${VIDIQ_BEARER_TOKEN}`,
      "content-type": "application/json",
      "user-agent": "Mozilla/5.0",
      "x-vidiq-client": VIDIQ_CLIENT_ID || "ext vch/3.168.0",
    },
  });

  if (!response.ok) {
    throw new Error(`VidIQ API Error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  const dailyData: VidiqDailyStat[] = data.daily_stats || [];
  const monthlyRaw = data.monthly_stats || [];
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

  // Reuse the raw monthly payload and the Python-compatible derivation logic.
  const monthlyStats = calculateMonthlyStats(monthlyRaw, currentTotalViews, currentSubsCount);

  console.log(`[VidIQ] Fetched ${dailyStats.length} daily stats and ${monthlyRaw.length} monthly stats for channel ${channelId}`);

  return {
    views30Days: Math.round(views30Days),
    dailyStats,
    monthlyStats,
  };
}
