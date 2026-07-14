-- CreateTable
CREATE TABLE "CompletedResource" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "resourceId" TEXT NOT NULL,
    "skill" TEXT NOT NULL,
    "resourceTitle" TEXT NOT NULL,
    "completedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "rating" INTEGER,
    "feedback" TEXT,
    "timeSpent" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompletedResource_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CompletedResource_userId_skill_idx" ON "CompletedResource"("userId", "skill");

-- CreateIndex
CREATE INDEX "CompletedResource_userId_completedAt_idx" ON "CompletedResource"("userId", "completedAt");

-- CreateIndex
CREATE UNIQUE INDEX "CompletedResource_userId_resourceId_key" ON "CompletedResource"("userId", "resourceId");

-- AddForeignKey
ALTER TABLE "CompletedResource" ADD CONSTRAINT "CompletedResource_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
