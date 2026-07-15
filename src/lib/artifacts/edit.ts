/**
 * Artifact Editing
 * 
 * Handles basic edit operations on saved artifacts:
 * - Make shorter/longer
 * - Change tone (formal/casual)
 * - Add/remove sections
 * - Uses Claude for surgical edits
 * - Saves edits as new versions
 */

import { env } from "@/lib/env";
import * as artifactDAL from '@/lib/artifacts/dal';
import type { ArtifactType } from '@/lib/artifacts/dal';
import { checkCoverLetterAlignment, buildMisalignmentMessage } from '@/lib/ai/assistant/services/profile-alignment';

export interface EditIntent {
  detected: boolean;
  operation?: 'shorten' | 'expand' | 'rewrite_tone' | 'add_section' | 'remove_section'
    | 'fix_grammar' | 'simplify' | 'strengthen' | 'translate';
  context?: string;
  /** Target word delta for expand/shorten operations. Defaults to 100 when not specified. */
  wordCount?: number;
  /** Target language for translate operations, e.g. "German". */
  targetLanguage?: string;
}

/** Default number of words to add/remove when the user gives no explicit number or ratio. */
const DEFAULT_WORD_DELTA = 100;
/** Never shorten a cover letter below this many words. */
const MIN_WORDS = 60;

/** Languages we recognize for "translate" edits. */
const LANGUAGES: Record<string, string> = {
  english: 'English', german: 'German', french: 'French', spanish: 'Spanish',
  italian: 'Italian', portuguese: 'Portuguese', dutch: 'Dutch', polish: 'Polish',
  romanian: 'Romanian', russian: 'Russian', mandarin: 'Mandarin Chinese',
  chinese: 'Chinese', japanese: 'Japanese', korean: 'Korean', arabic: 'Arabic',
  hindi: 'Hindi', swedish: 'Swedish', norwegian: 'Norwegian', danish: 'Danish',
  finnish: 'Finnish', greek: 'Greek', turkish: 'Turkish', czech: 'Czech',
  ukrainian: 'Ukrainian', hungarian: 'Hungarian'
};

/** Extract a target language from a translate request, e.g. "translate to German". */
function parseTargetLanguage(message: string): string | undefined {
  const lower = message.toLowerCase();
  for (const key of Object.keys(LANGUAGES)) {
    if (new RegExp(`\\b${key}\\b`).test(lower)) {
      return LANGUAGES[key];
    }
  }
  return undefined;
}

/**
 * When the user pastes an actual cover letter into their message (e.g.
 * "proofread this: Dear Hiring Manager, ..."), extract that letter so we edit
 * THAT content instead of the last saved artifact. Returns undefined when the
 * message is just a short command with no pasted letter.
 */
function extractInlineContent(message: string): string | undefined {
  // A pasted letter almost always contains a salutation. Grab from there on.
  const dearIdx = message.search(/\bDear\b/i);
  if (dearIdx >= 0) {
    const candidate = message.slice(dearIdx).trim();
    if (candidate.split(/\s+/).length >= 40) {
      return candidate;
    }
  }
  // Fallback: content after a command colon ("proofread this: <letter>").
  const colonIdx = message.indexOf(':');
  if (colonIdx >= 0) {
    const candidate = message.slice(colonIdx + 1).trim();
    if (candidate.split(/\s+/).length >= 40) {
      return candidate;
    }
  }
  return undefined;
}

/** Tone adjectives we recognize for "rewrite tone" edits. "informal" is listed first
 * and word boundaries are used so \binformal\b never matches inside... nothing, and
 * \bformal\b never matches inside "informal". */
const TONE_WORDS = [
  'informal', 'formal', 'casual', 'professional', 'enthusiastic', 'friendly',
  'conversational', 'confident', 'serious', 'playful', 'warm', 'persuasive',
  'concise', 'bold', 'humble', 'assertive', 'approachable', 'energetic'
];
const TONE_REGEX = new RegExp(`\\b(${TONE_WORDS.join('|')})\\b`, 'i');

/**
 * Extract an explicit word count from an edit message, e.g. "100 words longer",
 * "by 50 words", "add 75 words". Returns undefined when no number is present.
 */
function parseWordCount(message: string): number | undefined {
  const match = message.toLowerCase().match(/(\d+)\s*words?/);
  if (!match) {
    return undefined;
  }
  const value = Number.parseInt(match[1], 10);
  return Number.isFinite(value) && value > 0 ? value : undefined;
}

/**
 * Extract a multiplier/ratio from an edit message, e.g. "2 times shorter",
 * "3x longer", "twice as long", "double", "half". Returns undefined when none.
 * The value is the factor by which the length changes (e.g. 2 for "2 times",
 * 0.5 for "half").
 */
function parseMultiplier(message: string): number | undefined {
  const lower = message.toLowerCase();

  // "2 times", "2x", "1.5 times", "3 x"
  const timesMatch = lower.match(/(\d+(?:\.\d+)?)\s*(?:times|x)\b/);
  if (timesMatch) {
    const value = Number.parseFloat(timesMatch[1]);
    if (Number.isFinite(value) && value > 0) {
      return value;
    }
  }

  // Spelled-out numbers: "two times shorter", "three times longer"
  const numberWords: Record<string, number> = {
    one: 1, two: 2, three: 3, four: 4, five: 5,
    six: 6, seven: 7, eight: 8, nine: 9, ten: 10
  };
  const wordTimesMatch = lower.match(/\b(one|two|three|four|five|six|seven|eight|nine|ten)\s*(?:times|x)\b/);
  if (wordTimesMatch) {
    const value = numberWords[wordTimesMatch[1]];
    if (value && value > 0) {
      return value;
    }
  }

  if (/\b(twice|double)\b/.test(lower)) {
    return 2;
  }
  if (/\b(triple)\b/.test(lower)) {
    return 3;
  }
  if (/\bhalf\b/.test(lower)) {
    return 2; // "half as long" => factor of 2 applied in the shorten direction
  }

  return undefined;
}

/**
 * Resolve the ABSOLUTE target word count for an expand/shorten edit, using the
 * user's phrasing and the current length. Priority:
 *   1. Ratio/multiplier ("2 times shorter" => current/2, "3x longer" => current*3)
 *   2. Explicit word delta ("100 words longer" => current ± 100)
 *   3. Default delta of 100 words
 */
function resolveTargetWordCount(
  message: string,
  operation: 'shorten' | 'expand',
  currentWordCount: number
): number {
  const multiplier = parseMultiplier(message);
  if (multiplier && multiplier > 0) {
    const target = operation === 'shorten'
      ? Math.round(currentWordCount / multiplier)
      : Math.round(currentWordCount * multiplier);
    return Math.max(MIN_WORDS, target);
  }

  const delta = parseWordCount(message) ?? DEFAULT_WORD_DELTA;
  const target = operation === 'shorten'
    ? currentWordCount - delta
    : currentWordCount + delta;
  return Math.max(MIN_WORDS, target);
}


/**
 * Detect if user wants to edit a previous artifact
 * Returns edit operation type if detected
 */
export function detectEditIntent(message: string): EditIntent {
  const lowerMsg = message.toLowerCase();
  
  // Detect shorten operations
  if (
    lowerMsg.includes('shorten') ||
    lowerMsg.includes('make it shorter') ||
    lowerMsg.includes('too long') ||
    lowerMsg.includes('condense') ||
    lowerMsg.includes('shorter version') ||
    lowerMsg.includes('cut down') ||
    /\bshorter\b/.test(lowerMsg) ||
    /\d+\s*words?\s*(shorter|less)\b/.test(lowerMsg) ||
    /\d+\s*(?:times|x)\s*(shorter|smaller)\b/.test(lowerMsg) ||
    /\bin\s+half\b/.test(lowerMsg) ||
    // "half" as a ratio, but not "half a year" / "half an hour"
    (/\bhalf\b/.test(lowerMsg) && !/\bhalf\s+(a|an)\b/.test(lowerMsg))
  ) {
    return {
      detected: true,
      operation: 'shorten',
      context: message,
      wordCount: parseWordCount(message) ?? DEFAULT_WORD_DELTA
    };
  }
  
  // Detect expand operations
  if (
    lowerMsg.includes('expand') ||
    lowerMsg.includes('make it longer') ||
    lowerMsg.includes('more detail') ||
    lowerMsg.includes('add more') ||
    lowerMsg.includes('elaborate') ||
    lowerMsg.includes('go into more depth') ||
    (/\blonger\b/.test(lowerMsg) && !/\bno longer\b/.test(lowerMsg)) ||
    /\d+\s*words?\s*(longer|more)\b/.test(lowerMsg) ||
    /\d+\s*(?:times|x)\s*(longer|bigger)\b/.test(lowerMsg) ||
    // "twice"/"double"/"triple" as a ratio, but not "double a ..." phrasing
    (/\b(twice|double|triple)\b/.test(lowerMsg) && !/\b(twice|double|triple)\s+(a|an)\b/.test(lowerMsg))
  ) {
    return {
      detected: true,
      operation: 'expand',
      context: message,
      wordCount: parseWordCount(message) ?? DEFAULT_WORD_DELTA
    };
  }
  
  // Detect tone changes
  if (
    lowerMsg.includes('tone') ||
    lowerMsg.includes('more formal') ||
    lowerMsg.includes('more casual') ||
    lowerMsg.includes('more enthusiastic') ||
    // Any recognized tone adjective paired with an edit cue ("make it informal",
    // "sound more casual", "reword it to be friendly", "keep it professional").
    (TONE_REGEX.test(lowerMsg) && /\b(make|more|less|sound|feel|rewrite|reword|rephrase|write|keep|be)\b/.test(lowerMsg))
  ) {
    return {
      detected: true,
      operation: 'rewrite_tone',
      context: message
    };
  }
  
  // Detect section add/remove
  if (
    lowerMsg.includes('add') && (lowerMsg.includes('section') || lowerMsg.includes('paragraph')) ||
    lowerMsg.includes('remove') && (lowerMsg.includes('section') || lowerMsg.includes('paragraph')) ||
    lowerMsg.includes('add information about') ||
    lowerMsg.includes('remove the part about')
  ) {
    return {
      detected: true,
      operation: lowerMsg.includes('remove') ? 'remove_section' : 'add_section',
      context: message
    };
  }
  
  // Detect translate requests ("translate to German", "write it in French")
  if (
    lowerMsg.includes('translate') ||
    (/\b(in|to|into)\s+(english|german|french|spanish|italian|portuguese|dutch|polish|romanian|russian|mandarin|chinese|japanese|korean|arabic|hindi|swedish|norwegian|danish|finnish|greek|turkish|czech|ukrainian|hungarian)\b/.test(lowerMsg))
  ) {
    return {
      detected: true,
      operation: 'translate',
      context: message,
      targetLanguage: parseTargetLanguage(message)
    };
  }

  // Detect grammar/spelling fixes ("fix the grammar", "proofread", "fix typos")
  if (
    lowerMsg.includes('grammar') ||
    lowerMsg.includes('proofread') ||
    lowerMsg.includes('spelling') ||
    lowerMsg.includes('typo') ||
    lowerMsg.includes('fix mistakes') ||
    lowerMsg.includes('correct mistakes') ||
    lowerMsg.includes('fix errors') ||
    lowerMsg.includes('correct errors') ||
    lowerMsg.includes('punctuation')
  ) {
    return {
      detected: true,
      operation: 'fix_grammar',
      context: message
    };
  }

  // Detect simplify requests ("make it simpler", "plain english", "less jargon")
  if (
    /\bsimplif/.test(lowerMsg) ||
    lowerMsg.includes('simpler') ||
    lowerMsg.includes('plain english') ||
    lowerMsg.includes('plain language') ||
    lowerMsg.includes('less jargon') ||
    lowerMsg.includes('easier to read') ||
    lowerMsg.includes('easier to understand') ||
    lowerMsg.includes('dumb it down') ||
    lowerMsg.includes('less complex')
  ) {
    return {
      detected: true,
      operation: 'simplify',
      context: message
    };
  }

  // Detect strengthen requests ("make it stronger", "more compelling", "punchier")
  if (
    /\bstronger\b/.test(lowerMsg) ||
    lowerMsg.includes('more compelling') ||
    lowerMsg.includes('more impactful') ||
    lowerMsg.includes('more powerful') ||
    lowerMsg.includes('more convincing') ||
    lowerMsg.includes('punchier') ||
    lowerMsg.includes('stand out') ||
    lowerMsg.includes('more persuasive') ||
    lowerMsg.includes('wow factor')
  ) {
    return {
      detected: true,
      operation: 'strengthen',
      context: message
    };
  }
  
  // Generic edit request
  if (
    lowerMsg.includes('edit') ||
    lowerMsg.includes('modify') ||
    lowerMsg.includes('change') ||
    lowerMsg.includes('redo')
  ) {
    return {
      detected: true,
      operation: 'rewrite_tone',
      context: message
    };
  }
  
  return { detected: false };
}

/**
 * Apply edit to artifact content using Claude
 */
export async function applyEdit(
  originalContent: string,
  editIntent: EditIntent,
  anthropicApiKey: string,
  anthropicModel: string
): Promise<string> {
  if (!editIntent.operation) {
    throw new Error("Invalid edit operation");
  }

  let editPrompt = '';

  const currentWordCount = originalContent.trim().split(/\s+/).length;
  const editMessage = editIntent.context ?? '';

  switch (editIntent.operation) {
    case 'shorten': {
      const target = resolveTargetWordCount(editMessage, 'shorten', currentWordCount);
      const wordsToRemove = Math.max(0, currentWordCount - target);
      editPrompt = `Rewrite the cover letter below so the final version is about ${target} words long. It is currently about ${currentWordCount} words, so remove roughly ${wordsToRemove} words.

Rules:
- The final length MUST be close to ${target} words — this is a hard requirement, not a suggestion.
- Preserve the key points, structure, and professional tone.
- Cut redundancy and weak sentences rather than important content.

Cover letter:
${originalContent}

Output ONLY the rewritten cover letter text. Do not include any commentary, preamble, or word count.`;
      break;
    }

    case 'expand': {
      const target = resolveTargetWordCount(editMessage, 'expand', currentWordCount);
      const wordsToAdd = Math.max(0, target - currentWordCount);
      editPrompt = `Rewrite the cover letter below so the final version is about ${target} words long. It is currently about ${currentWordCount} words, so add roughly ${wordsToAdd} words of new content.

Rules:
- The final length MUST be close to ${target} words — this is a hard requirement, not a suggestion.
- Add substantive, specific detail (concrete achievements, skills, motivation) — do NOT add filler or repeat sentences.
- Preserve the existing tone, voice, and professional style.

Cover letter:
${originalContent}

Output ONLY the rewritten cover letter text. Do not include any commentary, preamble, or word count.`;
      break;
    }

    case 'rewrite_tone': {
      const toneMatch = editMessage.match(TONE_REGEX);
      const targetTone = (toneMatch?.[1] ?? 'professional').toLowerCase();
      editPrompt = `Rewrite the cover letter below in a more ${targetTone} tone and style. Keep the same facts, structure, and approximate length — change ONLY the tone and voice:

${originalContent}

Output ONLY the rewritten cover letter text. Do not include any commentary, preamble, or word count.`;
      break;
    }

    case 'add_section':
      editPrompt = `Add more relevant information to this. Expand with additional details, achievements, or context that strengthens it:

${originalContent}

Request: ${editIntent.context}

Provide ONLY the edited version, no explanations.`;
      break;

    case 'remove_section':
      editPrompt = `Remove or trim unnecessary parts of this while keeping the core message:

${originalContent}

Request: ${editIntent.context}

Provide ONLY the edited version, no explanations.`;
      break;

    case 'fix_grammar':
      editPrompt = `You are proofreading the cover letter below for a job applicant. Fix any genuine grammar, spelling, punctuation, or clarity issues. Keep the meaning, tone, structure, and approximate length. IMPORTANT: keep every placeholder field intact exactly as-is (e.g. [Your Name], [Company], [X years]) — these are intentionally filled from the applicant's profile later, so do NOT invent names, companies, or numbers. If the letter is already well written and needs no changes, keep it essentially unchanged.

Respond in EXACTLY this format:
FEEDBACK: <1-3 sentences of honest feedback on the letter's quality and what you changed. If nothing needed fixing, say it reads well and is ready to use.>
===LETTER===
<the full proofread cover letter>

Cover letter:
${originalContent}`;
      break;

    case 'simplify':
      editPrompt = `Rewrite the cover letter below using simpler, clearer language. Replace jargon and complex sentences with plain, easy-to-read wording while keeping ALL key points, the professional tone, and roughly the same length:

${originalContent}

Output ONLY the rewritten cover letter text. Do not include any commentary or preamble.`;
      break;

    case 'strengthen':
      editPrompt = `Rewrite the cover letter below to be more compelling, confident, and impactful. Use stronger action verbs, more persuasive phrasing, and a memorable opening and closing. Keep the same facts, tone-appropriateness, and approximate length — do NOT invent achievements or metrics that are not already present:

${originalContent}

Output ONLY the rewritten cover letter text. Do not include any commentary or preamble.`;
      break;

    case 'translate': {
      const language = editIntent.targetLanguage ?? 'English';
      editPrompt = `Translate the cover letter below into ${language}. Preserve the meaning, tone, structure, and any placeholder fields (e.g. [Your Name]). Produce natural, fluent ${language} appropriate for a professional job application:

${originalContent}

Output ONLY the translated cover letter text. Do not include any commentary or preamble.`;
      break;
    }
  }

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": anthropicApiKey,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: anthropicModel,
        max_tokens: 4096,
        messages: [
          {
            role: "user",
            content: editPrompt
          }
        ]
      })
    });

    if (!response.ok) {
      throw new Error(`Anthropic API error: ${response.status}`);
    }

    const data = await response.json() as { content?: Array<{ type?: string; text?: string }> };
    // Find the first text block (skip thinking blocks from extended-thinking models)
    const editedContent = data.content?.find((c) => c.type === "text")?.text?.trim();

    if (!editedContent) {
      throw new Error("Empty response from edit operation");
    }

    return editedContent;
  } catch (error) {
    console.error("Error applying edit:", error);
    throw error;
  }
}

/**
 * Store edited artifact as new version
 */
export async function storeEditedVersion(
  userId: string,
  parentArtifactId: string,
  editedContent: string,
  operation: string
): Promise<string> {
  try {
    const newVersion = await artifactDAL.createVersion(
      parentArtifactId,
      editedContent
    );

    console.log(`[Edit] Stored ${operation} version for artifact ${parentArtifactId}, new ID: ${newVersion.id}`);
    return newVersion.id;
  } catch (error) {
    console.error("Error storing edited version:", error);
    throw error;
  }
}

/**
 * Full edit workflow: find the most recent artifact, apply the requested edit,
 * store it as a new version, and return a formatted assistant reply.
 * Returns a fallback message when the user has no artifacts to edit.
 * Shared by both the profile-collection and services phases.
 */
export async function handleArtifactEditWorkflow(
  userId: string,
  editIntent: EditIntent,
  anthropicApiKey: string,
  anthropicModel: string,
  profileSummary?: string
): Promise<string> {
  const message = editIntent.context ?? '';

  // If the user pasted a letter directly into their message, edit THAT content
  // instead of the last saved artifact.
  const inlineContent = extractInlineContent(message);

  let sourceContent: string;
  let parentArtifactId: string | null = null;
  let artifactType: ArtifactType = 'cover_letter';

  if (inlineContent) {
    sourceContent = inlineContent;
  } else {
    const [coverLetters, jobPostings, interviewQAs] = await Promise.all([
      artifactDAL.findByUserAndType(userId, 'cover_letter'),
      artifactDAL.findByUserAndType(userId, 'job_posting'),
      artifactDAL.findByUserAndType(userId, 'interview_qa')
    ]);

    const allArtifacts = [...coverLetters, ...jobPostings, ...interviewQAs]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    if (allArtifacts.length === 0) {
      return `I don't have any saved artifacts to edit yet! 🤔

Let's create something first:
📝 **Generate a cover letter** (tailored to a specific job)
💬 **Save a job posting** (share the details with me)
🎤 **Practice an interview** (we'll save your answers)

What would help most? 😊`;
    }

    const artifactToEdit = allArtifacts[0];
    sourceContent = artifactToEdit.content;
    parentArtifactId = artifactToEdit.id;
    artifactType = artifactToEdit.type as ArtifactType;
  }

  // Guard: for a cover letter the user pasted in, verify it honestly reflects their
  // real profile before helping edit/proofread it. If it misrepresents the candidate,
  // flag it and refuse this specific task.
  if (
    inlineContent &&
    artifactType === 'cover_letter' &&
    profileSummary &&
    profileSummary !== '(no profile details on file yet)'
  ) {
    const alignment = await checkCoverLetterAlignment(
      sourceContent,
      profileSummary,
      anthropicApiKey,
      anthropicModel
    );
    if (!alignment.aligned) {
      return buildMisalignmentMessage(alignment.reason);
    }
  }

  const rawOutput = await applyEdit(
    sourceContent,
    editIntent,
    anthropicApiKey,
    anthropicModel
  );

  // Proofread returns "FEEDBACK: ...===LETTER===<letter>". Separate the feedback
  // (shown to the user) from the letter (stored + displayed).
  let feedback: string | undefined;
  let editedContent = rawOutput;
  if (editIntent.operation === 'fix_grammar') {
    const parts = rawOutput.split(/===LETTER===/i);
    if (parts.length >= 2) {
      feedback = parts[0].replace(/^\s*FEEDBACK:\s*/i, '').trim();
      editedContent = parts.slice(1).join('===LETTER===').trim();
    }
  }

  // Persist: a new version of an existing artifact, or a brand-new artifact when
  // the user pasted their own letter inline.
  if (parentArtifactId) {
    await storeEditedVersion(
      userId,
      parentArtifactId,
      editedContent,
      editIntent.operation || 'edit'
    );
  } else {
    await artifactDAL.store(userId, artifactType, editedContent, { source: 'user_provided' });
  }

  const readableType = artifactType.replace('_', ' ');

  // Proofread gets a feedback-first response.
  if (editIntent.operation === 'fix_grammar') {
    const intro = feedback
      ? `I proofread your ${readableType}. 📝\n\n**Feedback:** ${feedback}`
      : `I proofread your ${readableType}. 📝`;
    return `${intro}

---

${editedContent}

---

If it already matches your profile and reads well, you can use it as-is. Want me to make any other changes? 😊`;
  }

  const operationName = editIntent.operation === 'shorten' ? 'shortened' :
                        editIntent.operation === 'expand' ? 'expanded' :
                        editIntent.operation === 'simplify' ? 'simplified' :
                        editIntent.operation === 'strengthen' ? 'strengthened' :
                        editIntent.operation === 'translate'
                          ? `translated (${editIntent.targetLanguage ?? 'English'})`
                          :
                        'updated';

  return `Done! I've ${operationName} your ${readableType}! 📝✨

---

${editedContent}

---

How does this look? 😊

Would you like to:
✏️ **Make another change** (adjust tone, length, etc.)
💾 **Save this version** (keep it)
↩️ **Go back** (use the previous version)
✅ **Use this now** (ready to go!)

Let me know! 🚀`;
}


