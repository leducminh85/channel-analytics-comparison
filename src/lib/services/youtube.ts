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

