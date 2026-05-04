const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;

/**
 * Lấy Channel ID từ URL (hỗ trợ định dạng /channel/UC... hoặc /@handle)
 */
export async function getChannelIdFromUrl(url: string): Promise<string | null> {
  if (!YOUTUBE_API_KEY) {
    console.error("YOUTUBE_API_KEY is missing in environment variables");
    return null;
  }

  // 1. Kiểm tra định dạng /channel/UC...
  const channelIdMatch = url.match(/\/channel\/(UC[a-zA-Z0-9_-]{22})/);
  if (channelIdMatch) return channelIdMatch[1];

  // 2. Kiểm tra định dạng @handle
  const handleMatch = url.match(/@([a-zA-Z0-9._-]+)/);
  if (handleMatch) {
    const handle = handleMatch[1];
    try {
      // Sử dụng API forHandle (yêu cầu handle có dấu @)
      const response = await fetch(
        `https://www.googleapis.com/youtube/v3/channels?part=id&forHandle=@${handle}&key=${YOUTUBE_API_KEY}`
      );
      const data = await response.json();
      if (data.items && data.items.length > 0) {
        return data.items[0].id;
      }
    } catch (error) {
      console.error("Error fetching channel ID from handle:", error);
    }
  }

  return null;
}

/**
 * Lấy thông tin cơ bản của kênh Youtube
 */
export async function getChannelStats(channelId: string) {
  if (!YOUTUBE_API_KEY) throw new Error("YOUTUBE_API_KEY is missing");

  const response = await fetch(
    `https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics&id=${channelId}&key=${YOUTUBE_API_KEY}`
  );
  const data = await response.json();

  if (!data.items || data.items.length === 0) {
    throw new Error("Không tìm thấy kênh Youtube");
  }

  const channel = data.items[0];
  return {
    title: channel.snippet.title,
    logo_url: channel.snippet.thumbnails.high?.url || channel.snippet.thumbnails.default.url,
    subscriberCount: parseInt(channel.statistics.subscriberCount) || 0,
    videoCount: parseInt(channel.statistics.videoCount) || 0,
    viewCount: parseInt(channel.statistics.viewCount) || 0,
  };
}

/**
 * Tính toán chu kỳ đăng video dựa trên 10 video mới nhất
 */
export async function getUploadFrequency(channelId: string): Promise<string> {
  if (!YOUTUBE_API_KEY) return "N/A";

  try {
    const response = await fetch(
      `https://www.googleapis.com/youtube/v3/search?part=snippet&channelId=${channelId}&order=date&maxResults=10&type=video&key=${YOUTUBE_API_KEY}`
    );
    const data = await response.json();

    if (!data.items || data.items.length < 2) {
      return "Không đủ dữ liệu";
    }

    const videos = data.items;
    const newestDate = new Date(videos[0].snippet.publishedAt);
    const oldestDate = new Date(videos[videos.length - 1].snippet.publishedAt);

    const diffTime = Math.abs(newestDate.getTime() - oldestDate.getTime());
    const diffDays = diffTime / (1000 * 60 * 60 * 24);

    const avgDays = diffDays / (videos.length - 1);

    if (avgDays < 1) {
      const videosPerDay = Math.round(1 / avgDays);
      return `${videosPerDay} video / ngày`;
    } else {
      return `1 video / ${Math.round(avgDays)} ngày`;
    }
  } catch (error) {
    console.error("Error calculating upload frequency:", error);
    return "N/A";
  }
}
