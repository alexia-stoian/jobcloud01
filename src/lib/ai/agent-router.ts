/**
 * In-conversation agent routing for the Career Guide chat.
 *
 * The Career Guide chat is powered by two Bedrock AgentCore runtimes: the
 * Career Guide agent (default) and the Application Coach agent (cover letters +
 * interview practice). Until the agents own the handoff themselves, the app
 * detects intent from the user's message and routes each turn to the right
 * runtime.
 *
 * Routing is STICKY: once the Application Coach takes the lead, follow-up turns
 * (e.g. "make it shorter", "translate to German") stay with it so it keeps the
 * cover-letter / interview context. Control returns to the Career Guide only
 * when the user clearly asks for career / CV / profile / job-search help.
 */

export type AgentKind = "career_guide" | "application_coach";

// Cover-letter + interview intent → hand off to the Application Coach.
const APPLICATION_COACH_PATTERNS: RegExp[] = [
  // English
  /\bcover letter\b/i,
  /\bmotivation letter\b/i,
  /\bmock interview\b/i,
  /\b(practice|prep(are)?|rehearse)\b.{0,20}\binterview\b/i,
  /\binterview\b.{0,20}\b(practice|prep|question|answer)\b/i,
  /\binterview (practice|prep|preparation|question|questions|coaching)\b/i,
  /\bbehav(io)?ural question\b/i,
  // German
  /\banschreiben\b/i,
  /\bbewerbungsschreiben\b/i,
  /\bmotivationsschreiben\b/i,
  /\bvorstellungsgespräch\b/i,
  /\bbewerbungsgespräch\b/i,
  /\bprobeinterview\b/i,
  // French
  /\blettre de motivation\b/i,
  /\bentretien(?:\s+d['’]embauche)?\b/i,
  /\bsimulation d['’]entretien\b/i
];

// Career / CV / profile / job-search intent → return to the Career Guide.
const CAREER_GUIDE_PATTERNS: RegExp[] = [
  // English
  /\bcareer (advice|guidance|path|goal|coach|plan)\b/i,
  /\bjob search\b/i,
  /\bfind (a|another|my next) (job|role)\b/i,
  /\b(update|improve|review) my (cv|resume|profile)\b/i,
  /\bsalary (expectation|negotiation|range)\b/i,
  /\bwhich (role|job|career)\b/i,
  /\bskills? gap\b/i,
  // German
  /\bkarriere(beratung|ziel|weg|plan)?\b/i,
  /\bjobsuche\b/i,
  /\blebenslauf\b/i,
  /\bgehalt(svorstellung|sverhandlung)?\b/i,
  // French
  /\bconseil(s)? de carrière\b/i,
  /\brecherche d['’]emploi\b/i,
  /\bparcours professionnel\b/i,
  /\bsalaire\b/i
];

function matchesAny(patterns: RegExp[], text: string): boolean {
  return patterns.some((pattern) => pattern.test(text));
}

/**
 * Decide which agent should handle this turn.
 *
 * @param message  The user's latest message.
 * @param current  The agent that handled the previous turn (sticky default).
 */
export function detectActiveAgent(message: string, current: AgentKind = "career_guide"): AgentKind {
  const text = message.toLowerCase();

  if (matchesAny(APPLICATION_COACH_PATTERNS, text)) {
    return "application_coach";
  }

  if (matchesAny(CAREER_GUIDE_PATTERNS, text)) {
    return "career_guide";
  }

  // No clear intent — stay with whoever is currently leading the conversation.
  return current;
}
