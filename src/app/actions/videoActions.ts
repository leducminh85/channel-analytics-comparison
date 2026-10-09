"use server";

import { getServerSession } from "next-auth";
import type { Prisma } from "@prisma/client";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { getSessionUserId, requireGroupAccess } from "@/lib/groupAccess";
import { ACTIVE_SYNC_STATUSES, SYNC_LEASE_MS, scheduleVideoSync } from "@/lib/services/videoSync";
import { MIN_VIDEO_DURATION_SECONDS } from "@/lib/services/youtubeVideos";
import { publicationRange } from "@/lib/videoFilters";

async function authorize(channelId: string, groupId?: string, write = false) {
  const session = await getServerSession(authOptions);
  const userId = getSessionUserId(session);
  if (!userId) throw new Error("Vui lòng đăng nhập.");
  if ((session?.user as { role?: string })?.role === "ADMIN") return;
  if (!groupId) throw new Error("Không có quyền truy cập kênh.");
  await requireGroupAccess(groupId, userId, write ? ["OWNER", "EDITOR"] : ["OWNER", "EDITOR", "VIEWER"]);
  const link = await prisma.groupChannel.findUnique({ where: { groupId_channelId: { groupId, channelId } } });
  if (!link) throw new Error("Kênh không thuộc nhóm này.");
}

export async function listChannelVideos(input: { channelId?: string; groupId?: string; page?: number; pageSize?: number; search?: string; sort?: string; breakoutOnly?: boolean; startDate?: string; endDate?: string }) {
  let scope: Prisma.ChannelVideoWhereInput;
  if (input.channelId) {
    await authorize(input.channelId, input.groupId);
    scope = { channelId: input.channelId };
  } else {
    const session = await getServerSession(authOptions);
    const userId = getSessionUserId(session);
    if (!userId || !input.groupId) throw new Error("Không có quyền truy cập nhóm.");
    await requireGroupAccess(input.groupId, userId, ["OWNER", "EDITOR", "VIEWER"]);
    scope = { channel: { groups: { some: { groupId: input.groupId } } } };
  }
  scope = { ...scope, durationSeconds: { gt: MIN_VIDEO_DURATION_SECONDS } };
  const where: Prisma.ChannelVideoWhereInput = {
    ...scope,
    ...(input.breakoutOnly ? { breakoutScore: { gt: 2 } } : {}),
    ...((input.startDate || input.endDate) ? { publishedAt: publicationRange(input.startDate, input.endDate) } : {}),
    ...(input.search?.trim() ? { title: { contains: input.search.trim().slice(0, 200), mode: "insensitive" } } : {}),
  };
  const [total, saved, sync, activeGroupSyncs] = await Promise.all([
    prisma.channelVideo.count({ where }),
    prisma.channelVideo.count({ where: scope }),
    input.channelId ? prisma.channelVideoSync.findUnique({ where: { channelId: input.channelId } }) : Promise.resolve(null),
    input.channelId ? Promise.resolve(0) : prisma.channelVideoSync.count({ where: {
      channel: { groups: { some: { groupId: input.groupId } } },
      status: { in: ACTIVE_SYNC_STATUSES }, heartbeatAt: { gte: new Date(Date.now() - SYNC_LEASE_MS) },
    } }),
  ]);
  const pageSize = Math.min(60, Math.max(1, Math.floor(Number(input.pageSize) || 12)));
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(pages, Math.max(1, Math.floor(Number(input.page) || 1)));
  const orderBy: Prisma.ChannelVideoOrderByWithRelationInput[] = input.breakoutOnly && input.sort === "breakout"
    ? [{ breakoutScore: { sort: "desc", nulls: "last" } }, { id: "desc" }]
    : input.sort === "views"
    ? [{ viewCount: "desc" }, { id: "desc" }]
    : [{ publishedAt: { sort: input.sort === "oldest" ? "asc" : "desc", nulls: "last" } }, { id: "desc" }];
  const videos = await prisma.channelVideo.findMany({
    where, orderBy, skip: (page - 1) * pageSize, take: pageSize,
    select: { id: true, channelId: true, channel: { select: { id: true, title: true, logo_url: true } }, title: true, thumbnail: true, durationSeconds: true, viewCount: true, publishedAt: true, breakoutScore: true },
  });
  const stale = Boolean(sync && ACTIVE_SYNC_STATUSES.includes(sync.status) && sync.heartbeatAt.getTime() < Date.now() - SYNC_LEASE_MS);
  return {
    videos: videos.map(video => ({ ...video, viewCount: video.viewCount.toString(), publishedAt: video.publishedAt?.toISOString() || null })),
    total, saved, page, pages,
    isSyncing: activeGroupSyncs > 0 || Boolean(sync && ACTIVE_SYNC_STATUSES.includes(sync.status) && !stale),
    sync: sync ? {
      status: stale ? "INTERRUPTED" : sync.status, processed: sync.processed,
      error: stale ? "Đồng bộ bị gián đoạn. Bấm đồng bộ để tiếp tục lấy dữ liệu." : sync.error,
      completedAt: sync.completedAt?.toISOString() || null,
    } : null,
  };
}

export async function getVideoDetails(channelId: string, videoId: string, groupId?: string) {
  await authorize(channelId, groupId);
  const video = await prisma.channelVideo.findFirstOrThrow({
    where: { id: videoId, channelId, durationSeconds: { gt: MIN_VIDEO_DURATION_SECONDS } },
    select: { id: true, description: true },
  });
  return video;
}

export async function startVideoSync(channelId: string, groupId?: string) {
  await authorize(channelId, groupId, true);
  return scheduleVideoSync(channelId);
}
