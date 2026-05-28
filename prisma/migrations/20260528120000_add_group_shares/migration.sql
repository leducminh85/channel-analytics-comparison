-- CreateEnum
CREATE TYPE "GroupShareRole" AS ENUM ('VIEWER', 'EDITOR');

-- CreateTable
CREATE TABLE "compare_group_shares" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "GroupShareRole" NOT NULL DEFAULT 'VIEWER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "compare_group_shares_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "compare_group_shares_groupId_userId_key" ON "compare_group_shares"("groupId", "userId");

-- AddForeignKey
ALTER TABLE "compare_group_shares" ADD CONSTRAINT "compare_group_shares_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "compare_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "compare_group_shares" ADD CONSTRAINT "compare_group_shares_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
