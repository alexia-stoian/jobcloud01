-- AlterTable
ALTER TABLE "CandidateProfile" ADD COLUMN     "assistantState" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN     "commuteRadius" TEXT,
ADD COLUMN     "editorDraft" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN     "preferredWorkModel" TEXT,
ADD COLUMN     "relocationWillingness" TEXT,
ADD COLUMN     "targetIndustries" TEXT,
ADD COLUMN     "targetRoles" TEXT,
ADD COLUMN     "targetSeniority" TEXT,
ADD COLUMN     "visaSponsorship" TEXT,
ADD COLUMN     "workAuthorization" TEXT;

-- CreateTable
CREATE TABLE "OnboardingSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "profileId" TEXT,
    "locale" TEXT NOT NULL DEFAULT 'en',
    "currentStep" TEXT NOT NULL DEFAULT 'cv_upload',
    "targetRole" TEXT,
    "cvFileName" TEXT,
    "cvMimeType" TEXT,
    "cvExtractedFacts" JSONB NOT NULL DEFAULT '{}',
    "cvUncertainFacts" JSONB NOT NULL DEFAULT '{}',
    "conversationHistory" JSONB NOT NULL DEFAULT '[]',
    "pendingQuestions" JSONB NOT NULL DEFAULT '[]',
    "skippedQuestionIds" JSONB NOT NULL DEFAULT '[]',
    "confirmedQuestionIds" JSONB NOT NULL DEFAULT '[]',
    "lastInteractedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OnboardingSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InterviewSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "interviewType" TEXT NOT NULL,
    "targetRole" TEXT,
    "locale" TEXT NOT NULL DEFAULT 'en',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "overallScore" INTEGER,
    "strengths" JSONB NOT NULL DEFAULT '[]',
    "improvements" JSONB NOT NULL DEFAULT '[]',
    "recommendations" JSONB NOT NULL DEFAULT '[]',
    "userRating" INTEGER,
    "userFeedback" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InterviewSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InterviewQuestion" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "questionNum" INTEGER NOT NULL,
    "question" TEXT NOT NULL,
    "userAnswer" TEXT,
    "feedback" TEXT,
    "score" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InterviewQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OnboardingSession_userId_key" ON "OnboardingSession"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "OnboardingSession_profileId_key" ON "OnboardingSession"("profileId");

-- CreateIndex
CREATE INDEX "OnboardingSession_userId_currentStep_idx" ON "OnboardingSession"("userId", "currentStep");

-- CreateIndex
CREATE INDEX "InterviewSession_userId_createdAt_idx" ON "InterviewSession"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "InterviewSession_userId_interviewType_idx" ON "InterviewSession"("userId", "interviewType");

-- CreateIndex
CREATE INDEX "InterviewQuestion_sessionId_idx" ON "InterviewQuestion"("sessionId");

-- CreateIndex
CREATE UNIQUE INDEX "InterviewQuestion_sessionId_questionNum_key" ON "InterviewQuestion"("sessionId", "questionNum");

-- AddForeignKey
ALTER TABLE "OnboardingSession" ADD CONSTRAINT "OnboardingSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OnboardingSession" ADD CONSTRAINT "OnboardingSession_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "CandidateProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InterviewSession" ADD CONSTRAINT "InterviewSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InterviewQuestion" ADD CONSTRAINT "InterviewQuestion_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "InterviewSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
