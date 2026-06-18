ALTER TABLE "channels"
ADD COLUMN "youtubeUpdatedAt" TIMESTAMP(3),
ADD COLUMN "vidiqUpdatedAt" TIMESTAMP(3),
ADD COLUMN "lastUpdateAttemptAt" TIMESTAMP(3),
ADD COLUMN "lastUpdateStatus" TEXT;

UPDATE "channels"
SET
  "youtubeUpdatedAt" = "updatedAt",
  "vidiqUpdatedAt" = "updatedAt",
  "lastUpdateAttemptAt" = "updatedAt",
  "lastUpdateStatus" = 'SUCCESS'
WHERE "youtubeUpdatedAt" IS NULL
  AND "vidiqUpdatedAt" IS NULL
  AND "lastUpdateAttemptAt" IS NULL
  AND "lastUpdateStatus" IS NULL;
