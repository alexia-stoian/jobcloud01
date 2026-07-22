import { env } from "@/lib/env";
import { getBedrockModel, bedrockInvokeUrl, bedrockHeaders, BEDROCK_ANTHROPIC_VERSION } from "@/lib/ai/bedrock";
import { DurableProfileMemory } from "@/lib/profile/memory";
import {
  buildInterviewPrompt,
  buildFollowUpPrompt,
  InterviewType,
} from "./prompts";

/**
 * Call Amazon Bedrock (Claude via the InvokeModel endpoint) with an optional
 * system prompt and a single user message; returns the first text block. Throws
 * on missing credentials or a non-OK response so callers keep their existing
 * try/catch behavior (previously provided by the Anthropic SDK).
 */
async function callBedrockText(opts: {
  system?: string;
  content: string;
  maxTokens: number;
}): Promise<string> {
  const apiKey = process.env.AWS_BEARER_TOKEN_BEDROCK?.trim() || env.AWS_BEARER_TOKEN_BEDROCK?.trim();
  if (!apiKey) {
    throw new Error("Bedrock API key not configured");
  }
  const body: Record<string, unknown> = {
    anthropic_version: BEDROCK_ANTHROPIC_VERSION,
    max_tokens: opts.maxTokens,
    messages: [{ role: "user", content: opts.content }],
  };
  if (opts.system) {
    body.system = opts.system;
  }
  const response = await fetch(bedrockInvokeUrl(getBedrockModel()), {
    method: "POST",
    headers: bedrockHeaders(apiKey),
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error(`Bedrock API error: ${response.status}`);
  }
  const data = (await response.json()) as { content?: Array<{ type: string; text?: string }> };
  return data.content?.find((c) => c.type === "text")?.text ?? "";
}

/**
 * Interview response type - what Claude returns
 */
interface InterviewResponse {
  type: "question" | "feedback" | "summary";
  content: string;
  score?: number | null;
  nextQuestion?: string | null;
  isDone: boolean;
}

/**
 * Parse Claude response as JSON with error handling
 */
function parseInterviewResponse(content: string): InterviewResponse {
  try {
    // Remove markdown code blocks if present
    let jsonStr = content.trim();
    if (jsonStr.startsWith("```json")) {
      jsonStr = jsonStr.substring(7);
    }
    if (jsonStr.startsWith("```")) {
      jsonStr = jsonStr.substring(3);
    }
    if (jsonStr.endsWith("```")) {
      jsonStr = jsonStr.substring(0, jsonStr.length - 3);
    }

    const parsed = JSON.parse(jsonStr.trim());

    return {
      type: parsed.type || "question",
      content: parsed.content || "",
      score: parsed.score ?? null,
      nextQuestion: parsed.nextQuestion ?? null,
      isDone: parsed.isDone ?? false,
    };
  } catch (error) {
    console.error("Failed to parse Claude response:", error);
    // Return a default response on parse error
    return {
      type: "question",
      content:
        "Could you tell me more about your experience and what brings you to this opportunity today?",
      score: null,
      nextQuestion: null,
      isDone: false,
    };
  }
}

/**
 * Generate first question for interview session
 */
export async function generateFirstQuestion(
  interviewType: InterviewType,
  targetRole: string | null,
  profileContext: DurableProfileMemory | null,
  locale: string = "en"
): Promise<InterviewResponse> {
  try {
    const systemPrompt = buildInterviewPrompt(
      interviewType,
      targetRole,
      profileContext,
      locale
    );

    const responseText = await callBedrockText({
      system: systemPrompt,
      content:
        "Please start the interview with your opening question. Remember to respond in valid JSON format.",
      maxTokens: 500,
    });
    return parseInterviewResponse(responseText);
  } catch (error) {
    console.error("Error generating first question:", error);
    throw new Error("Failed to generate interview question");
  }
}

/**
 * Score answer and generate feedback with next question
 */
export async function scoreAnswerAndGenerateFeedback(
  previousQuestion: string,
  userAnswer: string,
  interviewType: InterviewType,
  questionCount: number,
  locale: string = "en"
): Promise<InterviewResponse> {
  try {
    const systemPrompt = buildInterviewPrompt(
      interviewType,
      null,
      null,
      locale
    );

    const followUpPrompt = buildFollowUpPrompt(
      previousQuestion,
      userAnswer,
      interviewType,
      locale,
      questionCount
    );

    const responseText = await callBedrockText({
      system: systemPrompt,
      content: followUpPrompt,
      maxTokens: 500,
    });
    return parseInterviewResponse(responseText);
  } catch (e) {
    console.error("Error scoring answer:", e);
    throw new Error("Failed to score interview answer");
  }
}

/**
 * Generate session summary after interview ends
 */
export async function generateSessionSummary(
  allQuestions: Array<{
    question: string;
    answer: string;
    feedback: string;
    score: number;
  }>,
  interviewType: InterviewType,
  locale: string = "en"
): Promise<{
  summary: string;
  overallScore: number;
  strengths: string[];
  improvements: string[];
  recommendations: string[];
}> {
  try {
    const languageInstruction =
      locale === "de"
        ? "Respond in German (Deutsch)."
        : locale === "fr"
          ? "Respond in French (Français)."
          : "Respond in English.";

    const questionsText = allQuestions
      .map(
        (q, i) =>
          `Q${i + 1}: ${q.question}\nA: ${q.answer}\nFeedback: ${q.feedback} (Score: ${q.score}/100)`
      )
      .join("\n\n");

    const averageScore = Math.round(
      allQuestions.reduce((sum, q) => sum + q.score, 0) / allQuestions.length
    );

    const responseText =
      (await callBedrockText({
        content: `Analyze this ${interviewType} interview and provide a structured summary:

${questionsText}

${languageInstruction}

Provide response in JSON format:
{
  "summary": "[2-3 paragraph comprehensive interview summary]",
  "strengths": ["[strength 1]", "[strength 2]", "[strength 3]"],
  "improvements": ["[improvement area 1]", "[improvement area 2]", "[improvement area 3]"],
  "recommendations": ["[actionable recommendation 1]", "[actionable recommendation 2]"]
}`,
        maxTokens: 800,
      })) || "{}";

    let parsed;
    try {
      let jsonStr = responseText.trim();
      if (jsonStr.startsWith("```json")) {
        jsonStr = jsonStr.substring(7);
      }
      if (jsonStr.startsWith("```")) {
        jsonStr = jsonStr.substring(3);
      }
      if (jsonStr.endsWith("```")) {
        jsonStr = jsonStr.substring(0, jsonStr.length - 3);
      }
      parsed = JSON.parse(jsonStr.trim());
    } catch (e) {
      parsed = {};
    }

    return {
      summary:
        parsed.summary ||
        "Interview completed. Review your answers and feedback above for detailed insights.",
      overallScore: averageScore,
      strengths: parsed.strengths || [
        "Clear communication",
        "Relevant experience",
        "Thoughtful answers",
      ],
      improvements: parsed.improvements || [
        "Provide more specific examples",
        "Include quantifiable results",
        "Research the company more thoroughly",
      ],
      recommendations: parsed.recommendations || [
        "Practice the STAR method for behavioral questions",
        "Prepare company-specific examples",
        "Focus on measurable achievements",
      ],
    };
  } catch (error) {
    console.error("Error generating session summary:", error);
    throw new Error("Failed to generate interview summary");
  }
}
