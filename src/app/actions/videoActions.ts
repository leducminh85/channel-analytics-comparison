"use server";

import { getServerSession } from "next-auth";
import type { Prisma } from "@prisma/client";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { getSessionUserId, requireGroupAccess } from "@/lib/groupAccess";
import { ACTIVE_SYNC_STATUSES, SYNC_LEASE_MS, scheduleVideoSync } from "@/lib/services/videoSync";

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

export async function listChannelVideos(input: { channelId: string; groupId?: string; page?: number; search?: string; sort?: string }) {
  await authorize(input.channelId, input.groupId);
  const where: Prisma.ChannelVideoWhereInput = {
    channelId: input.channelId,
    ...(input.search?.trim() ? { title: { contains: input.search.trim().slice(0, 200), mode: "insensitive" } } : {}),
  };
  const [total, saved, sync] = await Promise.all([
    prisma.channelVideo.count({ where }),
    prisma.channelVideo.count({ where: { channelId: input.channelId } }),
    prisma.channelVideoSync.findUnique({ where: { channelId: input.channelId } }),
  ]);
  const pageSize = 12;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(pages, Math.max(1, Math.floor(Number(input.page) || 1)));
  const orderBy: Prisma.ChannelVideoOrderByWithRelationInput[] = input.sort === "views"
    ? [{ viewCount: "desc" }, { id: "desc" }]
    : [{ publishedAt: { sort: input.sort === "oldest" ? "asc" : "desc", nulls: "last" } }, { id: "desc" }];
  const videos = await prisma.channelVideo.findMany({
    where, orderBy, skip: (page - 1) * pageSize, take: pageSize,
    select: { id: true, title: true, thumbnail: true, durationSeconds: true, viewCount: true, publishedAt: true },
  });
  const stale = Boolean(sync && ACTIVE_SYNC_STATUSES.includes(sync.status) && sync.heartbeatAt.getTime() < Date.now() - SYNC_LEASE_MS);
  return {
    videos: videos.map(video => ({ ...video, viewCount: video.viewCount.toString(), publishedAt: video.publishedAt?.toISOString() || null })),
    total, saved, page, pages,
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
    where: { id: videoId, channelId },
    select: { id: true, description: true },
  });
  return video;
}

export async function startVideoSync(channelId: string, groupId?: string) {
  await authorize(channelId, groupId, true);
  return scheduleVideoSync(channelId);
}
