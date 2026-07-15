-- CreateTable
CREATE TABLE "StoredArtifact" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "version" INTEGER NOT NULL DEFAULT 1,
    "parentArtifactId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StoredArtifact_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StoredArtifact_userId_type_createdAt_idx" ON "StoredArtifact"("userId", "type", "createdAt");

-- AddForeignKey
ALTER TABLE "StoredArtifact" ADD CONSTRAINT "StoredArtifact_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
