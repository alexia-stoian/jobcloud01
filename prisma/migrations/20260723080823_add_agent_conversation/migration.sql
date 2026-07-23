-- AlterTable
ALTER TABLE "OnboardingSession" ADD COLUMN     "agentConversation" JSONB NOT NULL DEFAULT '[]';
