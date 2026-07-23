/**
 * Persistence for Application Coach agent output — cover letters and interview
 * sessions. The Application Coach agent's reply JSON may include top-level
 * `cover_letter` and/or `interview` objects; these helpers map them onto the
 * app's durable models. Both are best-effort and never throw into a handler.
 */

import { db } from "@/lib/db";
import { store as storeArtifact, findByUserAndType, createVersion } from "@/lib/artifacts/dal";

export function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/** Coerce a value to a trimmed non-empty string, or null. */
function toStr(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  return null;
}

/** Coerce a value to an integer, or null. */
function toInt(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.round(value);
  }
  if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) {
    return Math.round(Number(value));
  }
  return null;
}

/** Coerce a value to an array of trimmed non-empty strings. */
function toStrArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((v): v is string => typeof v === "string" && v.trim().length > 0)
    : [];
}

/**
 * Persist a cover letter the agent produced (`data.cover_letter`) as a
 * StoredArtifact. `action: "revise"` versions the user's most recent letter;
 * anything else stores a new one.
 */
export async function persistCoverLetter(
  userId: string,
  coverLetter: Record<string, unknown>
): Promise<void> {
  try {
    const content = toStr(coverLetter.content);
    if (!content) {
      return;
    }
    const action = toStr(coverLetter.action) ?? "create";

    if (action === "revise") {
      const [latest] = await findByUserAndType(userId, "cover_letter");
      if (latest) {
        await createVersion(latest.id, content);
        return;
      }
    }

    const metadata: Record<string, unknown> = {};
    const company = toStr(coverLetter.company);
    const jobTitle = toStr(coverLetter.jobTitle);
    const jobUrl = toStr(coverLetter.jobUrl);
    const language = toStr(coverLetter.language);
    const tone = toStr(coverLetter.tone);
    const wordCount = toInt(coverLetter.wordCount);
    const emphasis = toStrArray(coverLetter.emphasis);
    if (company) metadata.company = company;
    if (jobTitle) metadata.jobTitle = jobTitle;
    if (jobUrl) metadata.jobUrl = jobUrl;
    if (language) metadata.language = language;
    if (tone) metadata.tone = tone;
    if (wordCount !== null) metadata.wordCount = wordCount;
    if (emphasis.length > 0) metadata.emphasis = emphasis;

    await storeArtifact(userId, "cover_letter", content, metadata);
  } catch (error) {
    console.error(
      "[application-coach] cover letter persist failed:",
      error instanceof Error ? error.message : error
    );
  }
}

/**
 * Persist an interview turn the agent emitted (`data.interview`) to
 * InterviewSession / InterviewQuestion. The `action` drives the lifecycle:
 * start → question → feedback → complete. A single active (not-yet-ended)
 * session per user is tracked; question/feedback/complete auto-open one if the
 * agent skipped "start".
 */
export async function persistInterview(
  userId: string,
  interview: Record<string, unknown>
): Promise<void> {
  try {
    const action = toStr(interview.action);
    if (!action) {
      return;
    }

    const openSession = async () =>
      db.interviewSession.create({
        data: {
          userId,
          interviewType: toStr(interview.interviewType) ?? "behavioral",
          targetRole: toStr(interview.targetRole),
          locale: toStr(interview.language) ?? "en"
        }
      });

    if (action === "start") {
      await openSession();
      return;
    }

    let activeSession = await db.interviewSession.findFirst({
      where: { userId, endedAt: null },
      orderBy: { createdAt: "desc" }
    });
    if (!activeSession) {
      activeSession = await openSession();
    }

    if (action === "question") {
      const questionNum = toInt(interview.questionNum);
      const question = toStr(interview.question);
      if (questionNum !== null && question) {
        await db.interviewQuestion.upsert({
          where: { sessionId_questionNum: { sessionId: activeSession.id, questionNum } },
          create: { sessionId: activeSession.id, questionNum, question },
          update: { question }
        });
      }
      return;
    }

    if (action === "feedback") {
      const questionNum = toInt(interview.questionNum);
      if (questionNum !== null) {
        await db.interviewQuestion.upsert({
          where: { sessionId_questionNum: { sessionId: activeSession.id, questionNum } },
          create: {
            sessionId: activeSession.id,
            questionNum,
            question: toStr(interview.question) ?? "",
            userAnswer: toStr(interview.userAnswer),
            feedback: toStr(interview.feedback),
            score: toInt(interview.score)
          },
          update: {
            userAnswer: toStr(interview.userAnswer),
            feedback: toStr(interview.feedback),
            score: toInt(interview.score)
          }
        });
      }
      return;
    }

    if (action === "complete") {
      await db.interviewSession.update({
        where: { id: activeSession.id },
        data: {
          endedAt: new Date(),
          overallScore: toInt(interview.overallScore),
          strengths: toStrArray(interview.strengths),
          improvements: toStrArray(interview.improvements),
          recommendations: toStrArray(interview.recommendations)
        }
      });
    }
  } catch (error) {
    console.error(
      "[application-coach] interview persist failed:",
      error instanceof Error ? error.message : error
    );
  }
}
