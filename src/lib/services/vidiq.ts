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
 * Tương tác với API VidIQ để lấy thống kê nâng cao
 * Logic dựa trên code Python cũ của người dùng
 */
export async function getVidiqStats(channelId: string) {
  if (!VIDIQ_BEARER_TOKEN) {
    throw new Error("Thiếu cấu hình VIDIQ_BEARER_TOKEN trong .env");
  }

  const url = `https://api.vidiq.com/youtube/channels/public/channel-pages/${channelId}?days=365`;
  
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
  const currentTotalViews = data.current_stats?.views?.count || 0;

  let views30Days = 0;
  if (dailyData.length >= 2) {
    // Logic Python: views_today_realtime = current_total_views - yesterday_total_views
    // daily_stats[0] là hôm nay (đang cập nhật), daily_stats[1] là hôm qua
    const yesterdayTotalViews = dailyData[1]?.views || 0;
    const viewsTodayRealtime = Math.max(0, currentTotalViews - yesterdayTotalViews);
    
    // views_past_29_days = sum(day.get("views_change", 0) for day in daily_stats[1:30])
    const past29DaysStats = dailyData.slice(1, 30);
    const viewsPast29Days = past29DaysStats.reduce(
      (sum, day) => sum + (day.views_change || 0),
      0
    );
    
    views30Days = viewsTodayRealtime + viewsPast29Days;
  }

  // Map lại dữ liệu để khớp với Prisma model DailyStat
  const dailyStats = dailyData.map((item) => ({
    date_str: String(item.date),
    views: item.views,
    views_change: item.views_change,
    subscribers: item.subscribers,
    subscribers_change: item.subscribers_change,
  }));

  return {
    views30Days: Math.round(views30Days),
    dailyStats,
  };
}
