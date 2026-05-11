const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;

function getErrorLog(error: unknown) {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };
  }

  return { message: String(error) };
}

async function readJsonResponse(response: Response) {
  try {
    return await response.json();
  } catch (error) {
    console.error("[YouTube] Failed to parse JSON response", {
      status: response.status,
      statusText: response.statusText,
      error: getErrorLog(error),
    });
    return null;
  }
}

/**
 * Extract a YouTube channel ID from a supported channel URL.
 */
export async function getChannelIdFromUrl(url: string): Promise<string | null> {
  console.info("[YouTube] Resolving channel ID from URL", { url });

  if (!YOUTUBE_API_KEY) {
    console.error("[YouTube] YOUTUBE_API_KEY is missing in environment variables", { url });
    return null;
  }

  const channelIdMatch = url.match(/\/channel\/(UC[a-zA-Z0-9_-]{22})/);
  if (channelIdMatch) {
    console.info("[YouTube] Channel ID resolved directly from /channel URL", {
      url,
      channelId: channelIdMatch[1],
    });
    return channelIdMatch[1];
  }

  const handleMatch = url.match(/@([a-zA-Z0-9._-]+)/);
  if (handleMatch) {
    const handle = handleMatch[1];
    try {
      const response = await fetch(
        `https://www.googleapis.com/youtube/v3/channels?part=id&forHandle=@${handle}&key=${YOUTUBE_API_KEY}`
      );
      const data = await readJsonResponse(response);

      console.info("[YouTube] forHandle lookup response", {
        url,
        handle,
        status: response.status,
        ok: response.ok,
        itemCount: Array.isArray(data?.items) ? data.items.length : 0,
        error: data?.error
          ? {
              code: data.error.code,
              message: data.error.message,
              status: data.error.status,
              errors: data.error.errors,
            }
          : null,
      });

      if (data?.items && data.items.length > 0) {
        return data.items[0].id;
      }
    } catch (error) {
      console.error("[YouTube] Error fetching channel ID from handle", {
        url,
        handle,
        error: getErrorLog(error),
      });
    }
  } else {
    console.warn("[YouTube] URL did not match supported channel formats", { url });
  }

  console.warn("[YouTube] Could not resolve channel ID from URL", { url });
  return null;
}

/**
 * Fetch basic channel metadata from the YouTube Data API.
 */
export async function getChannelStats(channelId: string) {
  if (!YOUTUBE_API_KEY) throw new Error("YOUTUBE_API_KEY is missing");

  console.info("[YouTube] Fetching channel stats", { channelId });

  const response = await fetch(
    `https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics&id=${channelId}&key=${YOUTUBE_API_KEY}`
  );
  const data = await readJsonResponse(response);

  console.info("[YouTube] Channel stats response", {
    channelId,
    status: response.status,
    ok: response.ok,
    itemCount: Array.isArray(data?.items) ? data.items.length : 0,
    error: data?.error
      ? {
          code: data.error.code,
          message: data.error.message,
          status: data.error.status,
          errors: data.error.errors,
        }
      : null,
  });

  if (!data?.items || data.items.length === 0) {
    throw new Error("Kh\u00f4ng t\u00ecm th\u1ea5y k\u00eanh Youtube");
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
 * Estimate the publishing cadence from the ten most recent videos.
 */
export async function getUploadFrequency(channelId: string): Promise<string> {
  if (!YOUTUBE_API_KEY) return "N/A";

  try {
    console.info("[YouTube] Fetching upload frequency", { channelId });

    const response = await fetch(
      `https://www.googleapis.com/youtube/v3/search?part=snippet&channelId=${channelId}&order=date&maxResults=10&type=video&key=${YOUTUBE_API_KEY}`
    );
    const data = await readJsonResponse(response);

    console.info("[YouTube] Upload frequency response", {
      channelId,
      status: response.status,
      ok: response.ok,
      itemCount: Array.isArray(data?.items) ? data.items.length : 0,
      error: data?.error
        ? {
            code: data.error.code,
            message: data.error.message,
            status: data.error.status,
            errors: data.error.errors,
          }
        : null,
    });

    if (!data?.items || data.items.length < 2) {
      return "Kh\u00f4ng \u0111\u1ee7 d\u1eef li\u1ec7u";
    }

    const videos = data.items;
    const newestDate = new Date(videos[0].snippet.publishedAt);
    const oldestDate = new Date(videos[videos.length - 1].snippet.publishedAt);

    const diffTime = Math.abs(newestDate.getTime() - oldestDate.getTime());
    const diffDays = diffTime / (1000 * 60 * 60 * 24);
    const avgDays = diffDays / (videos.length - 1);

    if (avgDays < 1) {
      const videosPerDay = Math.round(1 / avgDays);
      return `${videosPerDay} video / ng\u00e0y`;
    }

    return `1 video / ${Math.round(avgDays)} ng\u00e0y`;
  } catch (error) {
    console.error("[YouTube] Error calculating upload frequency", {
      channelId,
      error: getErrorLog(error),
    });
    return "N/A";
  }
}
