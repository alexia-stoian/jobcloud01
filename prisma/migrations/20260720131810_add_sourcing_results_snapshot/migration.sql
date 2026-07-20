-- AlterTable
ALTER TABLE "SourcingSession" ADD COLUMN     "resultsSnapshot" JSONB NOT NULL DEFAULT '{}';
