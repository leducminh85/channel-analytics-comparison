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
 */
export async function getVidiqStats(channelId: string) {
  if (!VIDIQ_BEARER_TOKEN || !VIDIQ_CLIENT_ID) {
    throw new Error("Thiếu cấu hình VIDIQ_BEARER_TOKEN hoặc VIDIQ_CLIENT_ID trong .env");
  }

  const url = `https://api.vidiq.com/youtube/channels/public/channel-pages/${channelId}?days=365`;
  
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${VIDIQ_BEARER_TOKEN}`,
      "x-vidiq-client": VIDIQ_CLIENT_ID,
    },
  });

  if (!response.ok) {
    throw new Error(`VidIQ API Error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();

  // Cấu trúc dữ liệu giả định dựa trên yêu cầu:
  // views30Days = views realtime hôm nay + tổng views_change của 29 ngày trước
  const dailyData: VidiqDailyStat[] = data.daily_stats || [];
  const realtimeViews = data.realtime_views || 0;

  // Tính toán views30Days
  const past29Days = dailyData.slice(0, 29);
  const totalPastViewsChange = past29Days.reduce(
    (sum, day) => sum + (day.views_change || 0),
    0
  );

  const views30Days = realtimeViews + totalPastViewsChange;

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
