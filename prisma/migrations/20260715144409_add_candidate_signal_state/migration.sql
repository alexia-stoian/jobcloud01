-- CreateTable
CREATE TABLE "CandidateSignalState" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "signals" JSONB NOT NULL DEFAULT '[]',
    "lastSessionId" TEXT,
    "inputCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CandidateSignalState_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CandidateSignalState_userId_key" ON "CandidateSignalState"("userId");

-- CreateIndex
CREATE INDEX "CandidateSignalState_userId_idx" ON "CandidateSignalState"("userId");

-- AddForeignKey
ALTER TABLE "CandidateSignalState" ADD CONSTRAINT "CandidateSignalState_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
