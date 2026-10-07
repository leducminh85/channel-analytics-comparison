-- CreateTable
CREATE TABLE "channel_videos" (
    "id" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "thumbnail" TEXT,
    "description" TEXT NOT NULL DEFAULT '',
    "durationSeconds" INTEGER,
    "viewCount" BIGINT NOT NULL DEFAULT 0,
    "publishedAt" TIMESTAMP(3),
    "hasCaption" BOOLEAN NOT NULL DEFAULT false,
    "caption" TEXT,
    "captionLanguage" TEXT,
    "captionStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "captionError" TEXT,
    "captionCheckedAt" TIMESTAMP(3),
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "channel_videos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "channel_video_syncs" (
    "channelId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'IDLE',
    "runId" TEXT,
    "heartbeatAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "processed" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,

    CONSTRAINT "channel_video_syncs_pkey" PRIMARY KEY ("channelId")
);

-- CreateIndex
CREATE INDEX "channel_videos_channelId_publishedAt_id_idx" ON "channel_videos"("channelId", "publishedAt", "id");

-- CreateIndex
CREATE INDEX "channel_videos_channelId_viewCount_id_idx" ON "channel_videos"("channelId", "viewCount", "id");

-- AddForeignKey
ALTER TABLE "channel_videos" ADD CONSTRAINT "channel_videos_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "channels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "channel_video_syncs" ADD CONSTRAINT "channel_video_syncs_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "channels"("id") ON DELETE CASCADE ON UPDATE CASCADE;
