import { randomUUID } from "node:crypto";
import { after } from "next/server";
import prisma from "@/lib/prisma";
import { fetchVideoPages } from "./youtubeVideos";
import { getVidiqVideoMetrics } from "./vidiq";
import { normalizeVideoMetrics } from "@/lib/videoFilters";

export const SYNC_LEASE_MS = 120000;
export const ACTIVE_SYNC_STATUSES = ["RUNNING"];

async function runSync(channelId: string, youtubeChannelId: string, runId: string) {
  const where = { channelId, runId };
  const heartbeat = async (data: { status?: string; processed?: number; error?: string | null } = {}) => {
    const updated = await prisma.channelVideoSync.updateMany({ where, data: { ...data, heartbeatAt: new Date() } });
    if (!updated.count) throw new Error("Sync superseded or channel deleted");
  };
  try {
    let processed = 0;
    let metricsError: string | null = null;
    for await (const videos of fetchVideoPages(youtubeChannelId)) {
      await heartbeat();
      await prisma.$transaction(videos.map(video => prisma.channelVideo.upsert({
        where: { id: video.id }, create: { ...video, channelId }, update: video,
      })));
      processed += videos.length;
      await heartbeat({ processed });
      // Metadata is saved first; a metrics outage must not discard video data.
      if (!metricsError) {
        for (let offset = 0; offset < videos.length; offset += 30) {
          await heartbeat();
          try {
            const ids = videos.slice(offset, offset + 30).map(video => video.id);
            const scores = normalizeVideoMetrics(await getVidiqVideoMetrics(ids), ids);
            const metricsUpdatedAt = new Date();
            await prisma.$transaction([...scores].map(([id, breakoutScore]) => prisma.channelVideo.updateMany({
              where: { id, channelId }, data: { breakoutScore, metricsUpdatedAt },
            })));
          } catch (error) {
            metricsError = error instanceof Error ? error.message : "Không thể cập nhật điểm đột biến.";
            break;
          }
        }
      }
    }
    await prisma.channelVideoSync.updateMany({ where, data: {
      status: metricsError ? "FAILED" : "COMPLETED", completedAt: new Date(), heartbeatAt: new Date(), error: metricsError,
    } });
  } catch (error) {
    console.error("[VideoSync]", channelId, error instanceof Error ? error.message : "Sync failed");
    await prisma.channelVideoSync.updateMany({ where, data: {
      status: "FAILED", heartbeatAt: new Date(),
      error: error instanceof Error && !/Prisma|invocation|Sync superseded/.test(error.message)
        ? error.message.slice(0, 240) : "Đồng bộ bị gián đoạn. Dữ liệu đã tải vẫn được giữ; hãy thử lại.",
    } }).catch(() => {});
  }
}

// A database lease prevents duplicate workers across requests/processes. A stopped
// process can be retried after two minutes, preserving saved pages.
export async function scheduleVideoSync(channelId: string) {
  const channel = await prisma.channel.findUniqueOrThrow({ where: { id: channelId }, select: { channel_id: true } });
  await prisma.channelVideoSync.upsert({ where: { channelId }, create: { channelId }, update: {} });
  const runId = randomUUID();
  const claimed = await prisma.channelVideoSync.updateMany({
    where: { channelId, OR: [
      { status: { notIn: ACTIVE_SYNC_STATUSES } },
      { heartbeatAt: { lt: new Date(Date.now() - SYNC_LEASE_MS) } },
    ] },
    data: { runId, status: "RUNNING", startedAt: new Date(), heartbeatAt: new Date(), processed: 0, error: null },
  });
  if (claimed.count) after(() => runSync(channelId, channel.channel_id, runId));
  return { started: Boolean(claimed.count) };
}
