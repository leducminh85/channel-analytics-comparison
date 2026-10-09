// Conservative long-form policy: exclude short and unknown-duration videos.
export const MIN_VIDEO_DURATION_SECONDS = 180;

export function isLongVideo(seconds: number | null): boolean {
  return seconds !== null && Number.isFinite(seconds) && seconds > MIN_VIDEO_DURATION_SECONDS;
}

export function parseDuration(value: string): number | null {
  const match = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?)?$/.exec(value);
  if (!match || !match.slice(1).some(Boolean)) return null;
  return Math.round(Number(match[1] || 0) * 86400 + Number(match[2] || 0) * 3600 + Number(match[3] || 0) * 60 + Number(match[4] || 0));
}

type VideoItem = {
  id: string;
  snippet: { channelId: string; title: string; description?: string; publishedAt?: string; thumbnails?: Record<string, { url: string }> };
  statistics?: { viewCount?: string };
  contentDetails?: { duration?: string };
};

export async function youtubeGet<T>(resource: string, params: Record<string, string>): Promise<T> {
  const key = process.env.YOUTUBE_API_KEY;
  if (!key) throw new Error("Chưa cấu hình YOUTUBE_API_KEY.");
  for (let attempt = 0; attempt < 3; attempt++) {
    const response = await fetch(`https://www.googleapis.com/youtube/v3/${resource}?${new URLSearchParams({ ...params, key })}`, {
      cache: "no-store", signal: AbortSignal.timeout(20000),
    });
    if ((response.status === 429 || response.status >= 500) && attempt < 2) {
      await new Promise(resolve => setTimeout(resolve, 1000 * 2 ** attempt));
      continue;
    }
    const data = await response.json();
    if (!response.ok) {
      const reason = data.error?.errors?.[0]?.reason;
      throw new Error(reason === "quotaExceeded" || reason === "dailyLimitExceeded"
        ? "Đã hết hạn mức YouTube API. Hãy thử lại sau khi hạn mức được cấp lại."
        : `YouTube API không trả dữ liệu (HTTP ${response.status}). Hãy kiểm tra API key và thử lại.`);
    }
    return data as T;
  }
  throw new Error("Không thể kết nối YouTube.");
}

// Yield a page at a time: memory does not grow with the channel's entire catalog.
export async function* fetchVideoPages(channelId: string) {
  const channel = await youtubeGet<{ items: { contentDetails: { relatedPlaylists: { uploads?: string } } }[] }>("channels", {
    part: "contentDetails", id: channelId,
  });
  const playlistId = channel.items?.[0]?.contentDetails.relatedPlaylists.uploads;
  if (!playlistId) throw new Error("Không tìm thấy playlist video của kênh.");
  let pageToken = "";
  const tokens = new Set<string>();
  do {
    const page = await youtubeGet<{ nextPageToken?: string; items: { contentDetails: { videoId?: string } }[] }>("playlistItems", {
      part: "contentDetails", playlistId, maxResults: "50", ...(pageToken ? { pageToken } : {}),
    });
    const ids = [...new Set(page.items.map(item => item.contentDetails.videoId).filter((id): id is string => Boolean(id)))];
    const details = ids.length ? await youtubeGet<{ items: VideoItem[] }>("videos", {
      part: "snippet,contentDetails,statistics", id: ids.join(","), maxResults: "50",
    }) : { items: [] };
    yield details.items.filter(item => item.snippet.channelId === channelId).map(item => ({
      id: item.id,
      title: item.snippet.title,
      description: item.snippet.description || "",
      thumbnail: item.snippet.thumbnails?.maxres?.url || item.snippet.thumbnails?.standard?.url || item.snippet.thumbnails?.high?.url || item.snippet.thumbnails?.medium?.url || item.snippet.thumbnails?.default?.url || null,
      publishedAt: item.snippet.publishedAt ? new Date(item.snippet.publishedAt) : null,
      durationSeconds: parseDuration(item.contentDetails?.duration || ""),
      viewCount: BigInt(item.statistics?.viewCount || "0"),
      syncedAt: new Date(),
    })).filter(video => isLongVideo(video.durationSeconds));
    pageToken = page.nextPageToken || "";
    if (pageToken && tokens.has(pageToken)) throw new Error("YouTube trả trang trùng lặp. Hãy thử đồng bộ lại.");
    tokens.add(pageToken);
  } while (pageToken);
}
