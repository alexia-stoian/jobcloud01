/**
 * Scope Detection Service
 * 
 * Detects off-topic queries and redirects users back to career topics
 * Ensures assistant stays focused on job search, CV, and interview preparation
 */

export interface OffTopicDetection {
  isOffTopic: boolean;
  category?: string;
  confidence: number; // 0-1
  reason?: string;
}

/**
 * Pattern library for off-topic detection
 */
const OFF_TOPIC_PATTERNS = {
  weather: {
    pattern: /weather|rain|snow|cold|hot|temperature|forecast|climate|wind|sunny|cloudy/i,
    category: "weather"
  },
  sports: {
    pattern:
      /football|basketball|soccer|tennis|baseball|cricket|rugby|hockey|game|score|team|player|championship|match|playoff/i,
    category: "sports"
  },
  medical: {
    pattern:
      /sick|disease|doctor|medicine|medication|illness|symptom|hospital|cure|treatment|vaccine|health|diagnosis|pain|injury|surgery/i,
    category: "medical"
  },
  legal: {
    pattern:
      /lawyer|attorney|lawsuit|court|legal|contract|liability|sue|copyright|patent|trademark|law|legislation|regulation/i,
    category: "legal"
  },
  cooking: {
    pattern:
      /recipe|cook|food|meal|pizza|dinner|breakfast|lunch|ingredient|spice|bake|sauce|dessert|cuisine|restaurant/i,
    category: "cooking"
  },
  personal_relationships: {
    pattern:
      /girlfriend|boyfriend|spouse|marriage|divorce|dating|relationship|love|breakup|romance|crush|partner|husband|wife/i,
    category: "personal relationships"
  },
  entertainment: {
    pattern:
      /movie|film|watch|netflix|series|show|actor|actress|director|plot|scene|season|episode|comedy|drama|horror|action/i,
    category: "entertainment"
  },
  gaming: {
    pattern: /game|play|video game|console|ps5|xbox|nintendo|fortnite|minecraft|level|boss|quest|achievement/i,
    category: "gaming"
  },
  music: {
    pattern:
      /song|music|artist|album|concert|band|singer|composer|instrument|melody|rhythm|beat|playlist|spotify|lyrics/i,
    category: "music"
  },
  travel: {
    pattern:
      /vacation|trip|travel|hotel|flight|airport|beach|mountain|tourist|passport|visa|destination|luggage|suitcase/i,
    category: "travel"
  }
};

/**
 * Career-related keywords that override off-topic detection
 */
const CAREER_KEYWORDS = /job|career|interview|salary|benefits|cv|resume|hiring|work|employment|position|role|company|employer|recruiter|linkedin|application|candidate|skill|experience|qualifications|professional|industry|market|opportunity|promotion|raise|negotiate|contract|full-time|part-time|freelance|startup|tech|engineer|manager|developer|analyst|specialist|consultant|strategist/i;

/**
 * Phrases that make something career-adjacent (e.g., "health insurance" is on-topic)
 */
const CAREER_CONTEXT_PHRASES = /work permit|health insurance|benefits|salary|tax|retirement|pension|compensation|work-life balance|remote|flexible|schedule|contract type|notice period|severance|stock options|bonus|commission|performance review|career path|growth|learning|professional development|conference|training|certification/i;

/**
 * Detect if a message is off-topic
 */
export function detectOffTopic(message: string): OffTopicDetection {
  if (!message || message.trim().length === 0) {
    return { isOffTopic: false, confidence: 0 };
  }

  // Check if message has career keywords - if so, likely on-topic
  if (CAREER_KEYWORDS.test(message)) {
    return { isOffTopic: false, confidence: 0 };
  }

  // Check each off-topic pattern
  for (const [, { pattern, category }] of Object.entries(OFF_TOPIC_PATTERNS)) {
    if (pattern.test(message)) {
      // Double-check: is this career-adjacent context?
      if (CAREER_CONTEXT_PHRASES.test(message)) {
        return { isOffTopic: false, confidence: 0 };
      }

      // It's off-topic
      return {
        isOffTopic: true,
        category,
        confidence: 0.8,
        reason: `Message detected as ${category} topic`
      };
    }
  }

  // No clear off-topic pattern found
  return { isOffTopic: false, confidence: 0 };
}

/**
 * Generate off-topic redirect message
 */
export function generateOffTopicRedirect(category?: string): string {
  const redirects = {
    weather: `I appreciate the question about weather! 😊 But I'm specifically here to help with your job search and career development! 🎯

Let's focus on something career-related instead. What would help most right now?
- 📝 Working on your CV or cover letter
- 🎤 Interview preparation
- 💼 Finding the right role
- ✨ Career advice

What's on your mind? 🚀`,

    sports: `That's exciting! 🏆 But I'm specifically here for career guidance, not sports talk! 😄

Speaking of which - is there anything about your job search I can help with?
- 📝 Cover letters and applications
- 🎤 Interview practice
- 💼 CV improvements
- ✨ Career strategy

What would help most? 🎯`,

    medical: `I hope everything's okay! 😊 But medical advice is outside my area - I'm specifically here for job search and career guidance.

If you need health advice, please consult a medical professional! 

But let's get back to your career! What can I help with?
- 📝 CV and cover letter
- 🎤 Interview prep
- 💼 Job search strategy
- ✨ Career development

What's your next step? 🚀`,

    legal: `That's an important question! ⚖️ But legal advice is outside my expertise - I focus on career and job search guidance.

For legal matters, please consult with a qualified attorney! 

Let's get back to your career! What would help right now?
- 📝 Applications and cover letters
- 🎤 Interview preparation
- 💼 Career planning
- ✨ Professional growth

What's your next move? 🎯`,

    cooking: `Sounds delicious! 🍽️ But cooking isn't really my thing - I'm your career coach! 😄

Let's focus on something I can actually help with:
- 📝 Your CV and cover letters
- 🎤 Interview preparation and practice
- 💼 Finding the right role
- ✨ Career advancement

What would help most with your job search? 🚀`,

    personal_relationships: `Relationship matters can be tricky! 💕 But I'm specifically here to help with career and job search guidance.

Let's focus on something I can help with:
- 📝 CV and cover letter writing
- 🎤 Interview preparation
- 💼 Career development
- ✨ Finding your ideal role

What's your next step in your career journey? 🎯`,

    entertainment: `That sounds fun! 🎬 But entertainment chat is outside my wheelhouse - I'm here for career help! 😄

Let's refocus on your job search:
- 📝 Crafting great applications
- 🎤 Preparing for interviews
- 💼 Building your professional profile
- ✨ Strategic career moves

What would help you most right now? 🚀`,

    gaming: `Gaming sounds fun! 🎮 But that's not my specialty - I'm your career assistant! 😊

Let's channel that energy into your career:
- 📝 Leveling up your CV
- 🎤 Conquering interview challenges
- 💼 Finding your ideal role
- ✨ Advancing your career

What's your next move? 🎯`,

    music: `Music is great! 🎵 But that's outside my expertise - I'm here for career guidance! 😄

Let's focus on something I can help with:
- 📝 Writing compelling cover letters
- 🎤 Interview preparation and feedback
- 💼 Career strategy and planning
- ✨ Professional development

What would help with your job search? 🚀`,

    travel: `Travel sounds amazing! ✈️ But I'm specifically here for career and job search help! 😊

Let's get back to your career journey:
- 📝 Applications and cover letters
- 🎤 Interview practice and prep
- 💼 Finding the right opportunity
- ✨ Career planning

What can I help with? 🎯`
  };

  const redirect = category && redirects[category as keyof typeof redirects] ? redirects[category as keyof typeof redirects] : redirects.personal_relationships;

  return redirect;
}

/**
 * Check if message is asking for help with career (on-topic even if it includes other words)
 */
export function isCareersRelated(message: string): boolean {
  return CAREER_KEYWORDS.test(message);
}

/**
 * Get quick redirect hint based on what was detected
 */
export function getRedirectHint(category?: string): string {
  switch (category) {
    case "weather":
      return "I handle career stuff, not weather! 😄";
    case "sports":
      return "Great sports fan? Let's channel that into your career! 🎯";
    case "medical":
      return "For medical advice, see a professional! I'm here for career help. 💼";
    case "legal":
      return "For legal advice, consult a lawyer! I'm your career coach! 🎯";
    default:
      return "That's interesting, but let's keep focused on your career! 💼";
  }
}
