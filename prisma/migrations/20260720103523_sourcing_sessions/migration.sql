-- CreateTable
CREATE TABLE "SourcingSession" (
    "id" TEXT NOT NULL,
    "recruiterUserId" TEXT NOT NULL,
    "needsSnapshot" JSONB NOT NULL DEFAULT '{}',
    "roleLabel" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SourcingSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SourcingCandidate" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "candidateUserId" TEXT NOT NULL,
    "fitBefore" INTEGER NOT NULL,
    "fitAfter" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SourcingCandidate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SourcingQuestion" (
    "id" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "orderIndex" INTEGER NOT NULL,
    "gapLabel" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "options" JSONB NOT NULL DEFAULT '[]',
    "allowCustom" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SourcingQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SourcingAnswer" (
    "id" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "chosenValue" TEXT,
    "freeText" TEXT,
    "satisfiedNeed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SourcingAnswer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SourcingSession_recruiterUserId_createdAt_idx" ON "SourcingSession"("recruiterUserId", "createdAt");

-- CreateIndex
CREATE INDEX "SourcingCandidate_candidateUserId_status_idx" ON "SourcingCandidate"("candidateUserId", "status");

-- CreateIndex
CREATE INDEX "SourcingCandidate_sessionId_idx" ON "SourcingCandidate"("sessionId");

-- CreateIndex
CREATE INDEX "SourcingQuestion_candidateId_orderIndex_idx" ON "SourcingQuestion"("candidateId", "orderIndex");

-- CreateIndex
CREATE UNIQUE INDEX "SourcingQuestion_candidateId_orderIndex_key" ON "SourcingQuestion"("candidateId", "orderIndex");

-- CreateIndex
CREATE UNIQUE INDEX "SourcingAnswer_questionId_key" ON "SourcingAnswer"("questionId");

-- AddForeignKey
ALTER TABLE "SourcingCandidate" ADD CONSTRAINT "SourcingCandidate_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "SourcingSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SourcingQuestion" ADD CONSTRAINT "SourcingQuestion_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "SourcingCandidate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SourcingAnswer" ADD CONSTRAINT "SourcingAnswer_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "SourcingQuestion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
