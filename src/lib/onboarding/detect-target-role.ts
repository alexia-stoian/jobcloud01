/**
 * Detect target role (career goal) from user message
 * 
 * This service extracts what role the user wants to pursue, explicitly stated
 * in their message. This is different from their current role (primaryRole from CV).
 * 
 * Only triggers on explicit statements like:
 * - "I want to become a Product Manager"
 * - "I'm targeting Software Engineer roles"
 * - "I'd like to transition to UX Design"
 * - "My goal is to work as a Solutions Architect"
 */

export function detectTargetRoleFromMessage(message: string): string | null {
  if (!message || message.length < 10) {
    return null;
  }

  const lowerMessage = message.toLowerCase();

  // Keywords that indicate the user is stating their target/desired role
  const intentPatterns = [
    // "I want to become a Solutions Architect" / "I'd like to become a PM"
    /(?:want to|would like to|like to|aim to|hoping to|plan to|trying to|looking to|going to)\s+become\s+(?:a\s+|an\s+)?([a-z][a-z\s&\-]+?)(?:\.|,|!|\?|$)/i,
    // "I want to be a Solutions Architect"
    /(?:want to|would like to|like to|aim to|hoping to)\s+be\s+(?:a\s+|an\s+)?([a-z][a-z\s&\-]+?)(?:\.|,|!|\?|$)/i,
    // "become a Solutions Architect" (without "want to")
    /\bbecome\s+(?:a\s+|an\s+)?([a-z][a-z\s&\-]{3,}?)(?:\s+(?:role|position))?\s*(?:\.|,|!|\?|$)/i,
    // "I'm targeting / pursuing Solutions Architect role"
    /(?:targeting|pursuing|transition(?:ing)? to|transitioning into)\s+(?:a\s+|an\s+)?([a-z][a-z\s&\-]+?)\s+(?:role|position|job)s?/i,
    // Original patterns for role/position variants
    /(?:want|like|aim|goal|target|pursue|apply for|interested in|looking for).*?(?:role|position|job|work).*?(?:as|in)?\s+([a-z\s&\-]+?)(?:\.|,|$)/i,
    /(?:seeking|looking for).*?(?:role|position)(?:\s+(?:in|as))?\s+([a-z\s&\-]+?)(?:\.|,|$)/i,
    /career goal[:\s]+([a-z\s&\-]+?)(?:\.|,|$)/i,
    /(?:target|desired) (?:role|position|job)[:\s]+([a-z\s&\-]+?)(?:\.|,|$)/i,
    // "my goal is to work as a Solutions Architect"
    /(?:goal is to|aim is to).*?(?:work|work as|become|be)\s+(?:a\s+|an\s+)?([a-z][a-z\s&\-]+?)(?:\.|,|!|\?|$)/i,
  ];

  for (const pattern of intentPatterns) {
    const match = lowerMessage.match(pattern);
    if (match && match[1]) {
      const extractedRole = match[1].trim();
      // Filter out common words that aren't roles
      if (
        extractedRole.length > 2 &&
        !["that", "this", "the", "and", "or", "a"].includes(extractedRole)
      ) {
        // Capitalize each word for consistency
        return extractedRole
          .split(/\s+/)
          .map(word => word.charAt(0).toUpperCase() + word.slice(1))
          .join(" ");
      }
    }
  }

  return null;
}

/**
 * Extract role from conversation history to determine current target role
 * Prioritizes most recent explicit statement
 */
export function extractTargetRoleFromHistory(conversationHistory: Array<{ actor: string; text: string }>): string | null {
  if (!Array.isArray(conversationHistory)) {
    return null;
  }

  // Go through conversation in reverse (most recent first)
  for (let i = conversationHistory.length - 1; i >= 0; i--) {
    const entry = conversationHistory[i];
    if (entry.actor === "user") {
      const detectedRole = detectTargetRoleFromMessage(entry.text);
      if (detectedRole) {
        return detectedRole;
      }
    }
  }

  return null;
}

/**
 * Clarifying question to ask after CV upload if target role is not set
 */
export function getTargetRoleQuestion(locale: "en" | "de" | "fr"): string {
  const questions = {
    en: "I've reviewed your CV! 👀 Before we dive deeper, what role are you targeting? For example: Product Manager, UX Designer, Software Engineer, etc. This helps me tailor all my advice to your goals! 🎯",
    de: "Ich habe deinen Lebenslauf überprüft! 👀 Bevor wir tiefer einsteigen, welche Rolle strebst du an? Zum Beispiel: Produktmanager, UX-Designer, Softwareentwickler, usw. Das hilft mir, alle meine Ratschläge auf deine Ziele abzustimmen! 🎯",
    fr: "J'ai examiné ton CV! 👀 Avant d'aller plus loin, quel rôle vises-tu? Par exemple: Chef de produit, Designer UX, Ingénieur logiciel, etc. Cela m'aide à adapter tous mes conseils à tes objectifs! 🎯"
  };
  return questions[locale] || questions.en;
}
