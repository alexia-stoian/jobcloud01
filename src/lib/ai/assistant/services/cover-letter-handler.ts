/**
 * Cover Letter Request Handler
 * 
 * Routes cover letter requests through the assistant and manages state updates
 */

import type { CandidateProfile } from "@prisma/client";
import type { ExtractedCvFacts } from "@/lib/cv/extract";
import type { AssistantState } from "@/types/assistant-state";
import type { JobInfo } from "./cover-letter";
import { detectJobInfo, inferRefinementMode, generateCoverLetter, countWords } from "./cover-letter";
import { updateServiceState } from "@/types/assistant-state";
import { checkCoverLetterAlignment, buildMisalignmentMessage } from "./profile-alignment";

export interface CoverLetterHandlerResponse {
  answer: string;
  newState: AssistantState;
  artifactData?: {
    content: string;
    company: string;
    jobTitle: string;
  };
}

/**
 * Main handler for cover letter requests
 * Detects job info, generates letter, formats response
 */
export async function handleCoverLetterRequest(
  message: string,
  profile: CandidateProfile,
  state: AssistantState,
  cvData: ExtractedCvFacts | undefined,
  apiKey: string,
  model: string,
  profileSummary?: string
): Promise<CoverLetterHandlerResponse> {
  // Detect job information from message
  const jobInfo = detectJobInfo(message);

  // If we don't have enough job info, ask for more details
  if (!jobInfo?.title && !jobInfo?.company) {
    const answer = `I'd love to help with a cover letter! 📝✨ Could you tell me about the job you're interested in?

Please share:
📋 **Job title** (e.g., "Senior Developer", "Product Manager")
🏢 **Company name** (e.g., "Google", "Microsoft")
📌 **Ideally, a link to the job posting or description of key requirements**

Once you share these details, I'll create a personalized cover letter that highlights your best qualifications! 🎯`;

    // Update state to track we're working on cover letters
    const newState = updateServiceState(state, "cover-letter", {
      draftCount: 0
    });

    return { answer, newState };
  }

  // Guard: if the requested role clearly contradicts the candidate's real profile
  // (e.g., a nurse cover letter for a software engineer), flag it and refuse rather
  // than help misrepresent their background.
  if (profileSummary && profileSummary !== "(no profile details on file yet)") {
    const requestDescription = `The candidate is asking for a cover letter for this role: "${jobInfo.title || "Unknown Role"}" at "${jobInfo.company || "Unknown Company"}".\nTheir message: ${message}`;
    const alignment = await checkCoverLetterAlignment(requestDescription, profileSummary, apiKey, model);
    if (!alignment.aligned) {
      return {
        answer: buildMisalignmentMessage(alignment.reason),
        newState: state
      };
    }
  }

  try {
    // Generate the cover letter
    const response = await generateCoverLetter(
      {
        jobInfo: {
          title: jobInfo.title || "Unknown Role",
          company: jobInfo.company || "Unknown Company",
          description: jobInfo.description
        },
        userProfile: profile,
        cvData
      },
      apiKey,
      model
    );

    // Format response with personality
    const formattedResponse = `Here's your personalized cover letter! 📝✨ I've highlighted your ${response.emphasis.join(", ")} and matched it to what ${response.company} is looking for! 🎯

---

${response.letter}

---

**What I emphasized:**
${response.emphasis.map((e) => `✓ ${e}`).join("\n")}

**Word count:** ${response.wordCount} words

Would you like me to:
🔄 **Adjust the tone** (more formal/creative/enthusiastic)
✏️ **Emphasize different skills** or experiences
📝 **Restructure** any sections
💾 **Generate a different version** (alternative approach)
✅ **This looks perfect!**

Let me know! 😊🚀`;

    // Update state with generation info
    const newState = updateServiceState(state, "cover-letter", {
      lastGeneratedRole: response.title,
      lastDraftWordCount: response.wordCount,
      draftCount: (state.services.coverLetter?.draftCount || 0) + 1,
      lastGeneratedAt: new Date().toISOString()
    });

    return {
      answer: formattedResponse,
      newState,
      artifactData: {
        content: response.letter,
        company: response.company,
        jobTitle: response.title
      }
    };
  } catch (error) {
    console.error("Cover letter generation error:", error);

    const answer = `Sorry! I ran into a technical issue generating your cover letter. 😅 Please try again in a moment, or provide more details about the job and I can work on it. 💼`;

    const newState = updateServiceState(state, "cover-letter", {
      draftCount: (state.services.coverLetter?.draftCount || 0)
    });

    return { answer, newState };
  }
}

/**
 * Handle cover letter refinement requests
 * (e.g., "make it shorter", "more formal")
 */
export async function handleCoverLetterRefinement(
  message: string,
  currentDraft: string,
  profile: CandidateProfile,
  state: AssistantState,
  jobInfo: JobInfo,
  cvData: ExtractedCvFacts | undefined,
  apiKey: string,
  model: string
): Promise<CoverLetterHandlerResponse> {
  const currentWordCount = countWords(currentDraft);
  const refinementMode = inferRefinementMode(message, currentWordCount);

  if (!refinementMode) {
    // User message doesn't indicate clear refinement
    const answer = `I'm not sure what refinement you'd like! Could you be more specific? For example:
🔄 "**Make it shorter**" (condense the main points)
✏️ "**Add more about my leadership**" (emphasize specific strengths)
📝 "**Make it more formal**" (professional tone)
💾 "**Give me a completely different version**" (alternative approach)

Let me know what would help! 😊`;

    const newState = updateServiceState(state, "cover-letter", {
      draftCount: (state.services.coverLetter?.draftCount || 0)
    });

    return { answer, newState };
  }

  try {
    // Generate refined version
    const response = await generateCoverLetter(
      {
        jobInfo,
        userProfile: profile,
        cvData,
        refinementMode,
        currentDraft,
        targetWordCount: refinementMode === "expand" ? currentWordCount + 100 : currentWordCount - 75
      },
      apiKey,
      model
    );

    // Format response
    const refinementLabel =
      refinementMode === "expand"
        ? "expanded version"
        : refinementMode === "summarize"
          ? "condensed version"
          : "revised version";

    const formattedResponse = `Here's your ${refinementLabel}! ✨

---

${response.letter}

---

**Changes made:**
- Mode: ${refinementMode.toUpperCase()}
- Word count: ${response.wordCount} words (was ${currentWordCount})
${refinementMode === "expand" ? "- Added more detail and examples" : ""}
${refinementMode === "summarize" ? "- Condensed while keeping key points" : ""}
${refinementMode === "rewrite" ? "- Took a fresh approach" : ""}

How's this? Need more adjustments? 😊🚀`;

    const newState = updateServiceState(state, "cover-letter", {
      lastDraftWordCount: response.wordCount,
      draftCount: (state.services.coverLetter?.draftCount || 0) + 1,
      lastGeneratedAt: new Date().toISOString()
    });

    return { answer: formattedResponse, newState };
  } catch (error) {
    console.error("Refinement error:", error);

    const answer = `Sorry! I ran into an issue refining your cover letter. 😅 Please try again! 💼`;

    const newState = updateServiceState(state, "cover-letter", {
      draftCount: (state.services.coverLetter?.draftCount || 0)
    });

    return { answer, newState };
  }
}

/**
 * Detect if message is a cover letter request
 */
export function isCoverLetterRequest(message: string): boolean {
  const lowerMsg = message.toLowerCase();
  return (
    lowerMsg.includes("cover letter") ||
    lowerMsg.includes("letter") ||
    (lowerMsg.includes("job") && (lowerMsg.includes("at") || lowerMsg.includes("for"))) ||
    !!detectJobInfo(message)
  );
}
