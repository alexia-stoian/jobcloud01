export type OnboardingOption = {
  value: string;
  label: string;
  description?: string;
};

export type InteractiveQuestion = {
  id: string;
  field:
    | "fullName"
    | "currentJobSituation"
    | "employmentObjective"
    | "primaryRole"
    | "preferredLocation"
    | "targetRoles"
    | "targetSeniority"
    | "targetIndustries"
    | "preferredWorkModel"
    | "contractPreference"
    | "workRate"
    | "workPermitStatus"
    | "salaryExpectation"
    | "visaSponsorship"
    | "relocationWillingness"
    | "commuteRadius";
  backstory: string;
  prompt: string;
  placeholder?: string;
  options?: OnboardingOption[];
  allowCustom: boolean;
};

export type InteractiveQuestionState = {
  question: InteractiveQuestion | null;
  completedFields: string[];
  missingFields: string[];
  done: boolean;
};

const PRE_CV_QUESTION_FLOW: InteractiveQuestion[] = [
  {
    id: "employmentObjective",
    field: "employmentObjective",
    backstory: "Let's align on your main goal right now! 🎯 This helps me tailor every next step to what you actually want, and make sure I'm giving you advice that matches YOUR vision! 🚀",
    prompt: "What is your main goal right now?",
    options: [
      { value: "Find a new job", label: "Find a new job" },
      { value: "Change career direction", label: "Change career direction" },
      { value: "Grow in current field", label: "Grow in current field" },
      { value: "Return to work", label: "Return to work" }
    ],
    allowCustom: true
  },
  {
    id: "primaryRole",
    field: "primaryRole",
    backstory: "Great! 🎯 This helps me personalize advice, CV wording, and interview prep around the role you care about most. Everything I suggest from here on will be tailored to help you land this role! ✨",
    prompt: "Which role should we optimize your profile for first?",
    options: [
      { value: "Software Engineer", label: "Software Engineer" },
      { value: "Data Analyst", label: "Data Analyst" },
      { value: "Product Manager", label: "Product Manager" },
      { value: "QA Engineer", label: "QA Engineer" },
      { value: "Project Manager", label: "Project Manager" }
    ],
    placeholder: "Example: Senior Frontend Developer",
    allowCustom: true
  }
];

const POST_CV_PREFERENCE_FLOW: InteractiveQuestion[] = [
  {
    id: "preferredLocation",
    field: "preferredLocation",
    backstory: "Perfect! 📍 I've filled what I could from your CV. Now let's lock in the preferences that matter most for matching. This helps me focus on opportunities that actually fit your mobility! 🌍",
    prompt: "Where do you ideally want to work?",
    options: [
      { value: "Zurich", label: "Zurich" },
      { value: "Geneva", label: "Geneva" },
      { value: "Basel", label: "Basel" },
      { value: "Lausanne", label: "Lausanne" },
      { value: "Bern", label: "Bern" },
      { value: "Remote in Switzerland", label: "Remote in Switzerland" }
    ],
    placeholder: "Example: Zurich + hybrid, or remote in Switzerland",
    allowCustom: true
  },
  {
    id: "targetRoles",
    field: "targetRoles",
    backstory: "Awesome! 🎯 I need to know which roles you want to be considered for — not just your current title. This helps me make sure I'm surfacing the right opportunities for YOU! 🚀",
    prompt: "Which roles should your profile target?",
    placeholder: "Example: Product Manager, Senior Product Manager",
    allowCustom: true
  },
  {
    id: "targetSeniority",
    field: "targetSeniority",
    backstory: "Great question! 💼 Seniority level helps me avoid mismatches between your experience and the roles you see. This way, we focus on roles where you'll actually thrive! ✨",
    prompt: "What seniority level are you targeting?",
    options: [
      { value: "Junior", label: "Junior" },
      { value: "Mid", label: "Mid" },
      { value: "Senior", label: "Senior" },
      { value: "Lead", label: "Lead" },
      { value: "Open", label: "Open" }
    ],
    allowCustom: true
  },
  {
    id: "targetIndustries",
    field: "targetIndustries",
    backstory: "Love this! 🌟 Industry preferences help me prioritize the right companies and examples when I help you further. Let's make sure we're looking at places where you'd actually want to work! 🚀",
    prompt: "Which industries are you most interested in?",
    placeholder: "Example: SaaS, fintech, healthcare, climate tech",
    allowCustom: true
  },
  {
    id: "preferredWorkModel",
    field: "preferredWorkModel",
    backstory: "Smart! 💼 Work model is part of a complete profile because it strongly affects fit and shortlist quality. Remote, hybrid, on-site — let's lock in what works best for you! ✨",
    prompt: "What work model do you prefer?",
    options: [
      { value: "Remote", label: "Remote" },
      { value: "Hybrid", label: "Hybrid" },
      { value: "On-site", label: "On-site" },
      { value: "Open", label: "Open" }
    ],
    allowCustom: true
  },
  {
    id: "contractPreference",
    field: "contractPreference",
    backstory: "Got it! 💼 Contract preference helps me filter out roles that look good on paper but don't fit your plan. This means I only show you opportunities that actually match your career goals! 🎯",
    prompt: "What contract type do you prefer?",
    options: [
      { value: "Permanent", label: "Permanent" },
      { value: "Fixed-term", label: "Fixed-term" },
      { value: "Contract/Freelance", label: "Contract/Freelance" },
      { value: "Open to both", label: "Open to both" }
    ],
    allowCustom: true
  },
  {
    id: "workRate",
    field: "workRate",
    backstory: "Excellent! ⏰ Your preferred workload is part of your complete profile because many Swiss roles are filtered by percentage. This helps me match opportunities that actually fit your lifestyle! 🚀",
    prompt: "What work rate are you targeting?",
    options: [
      { value: "100%", label: "100% (full-time)" },
      { value: "80-90%", label: "80-90%" },
      { value: "60-70%", label: "60-70%" },
      { value: "Flexible", label: "Flexible" }
    ],
    allowCustom: true
  },
  {
    id: "salaryExpectation",
    field: "salaryExpectation",
    backstory: "Perfect! 💰 Salary expectations help me keep role suggestions realistic and aligned with your market level. This way, we don't waste time on roles that don't match your worth! 💪",
    prompt: "What salary range are you targeting (CHF gross/year)?",
    options: [
      { value: "60k-80k CHF", label: "60k-80k CHF" },
      { value: "80k-100k CHF", label: "80k-100k CHF" },
      { value: "100k-120k CHF", label: "100k-120k CHF" },
      { value: "120k+ CHF", label: "120k+ CHF" },
      { value: "Open/depends on role", label: "Open/depends on role" }
    ],
    allowCustom: true
  },
  {
    id: "workPermitStatus",
    field: "workPermitStatus",
    backstory: "Critical info! 🇨🇭 Work authorization changes which roles are realistic right now. Knowing this helps me confidently match you with opportunities where you're legally eligible to work! 🎉",
    prompt: "What is your work authorization status in Switzerland?",
    options: [
      { value: "Swiss Citizen", label: "🇨🇭 Swiss Citizen", description: "full right to work" },
      { value: "C Permit", label: "C Permit", description: "permanent residence" },
      { value: "B Permit", label: "B Permit", description: "residence with employment authorization" },
      { value: "L Permit", label: "L Permit", description: "short-term residence" },
      { value: "G Permit", label: "G Permit", description: "cross-border commuter" },
      { value: "EU/EFTA Citizen", label: "EU/EFTA Citizen", description: "free movement rights" },
      { value: "Other valid authorization", label: "Other valid authorization", description: "asylum, temporary admission, etc." },
      { value: "No current authorization", label: "No current authorization", description: "looking to relocate/apply" }
    ],
    allowCustom: true
  },
  {
    id: "visaSponsorship",
    field: "visaSponsorship",
    backstory: "Got it! 🌍 Sponsorship expectations help me avoid suggesting roles that are unrealistic from the start. This means I focus on opportunities that actually work for YOUR situation! ✨",
    prompt: "Do you require visa sponsorship?",
    options: [
      { value: "No", label: "No" },
      { value: "Yes", label: "Yes" },
      { value: "Maybe depending on country", label: "Maybe depending on country" }
    ],
    allowCustom: true
  },
  {
    id: "relocationWillingness",
    field: "relocationWillingness",
    backstory: "Great! 🚀 Your openness to relocation changes which opportunities I should surface and how broadly I search. Let's make sure I'm looking in the right places for you! 🌍",
    prompt: "How open are you to relocation?",
    options: [
      { value: "Not open to relocation", label: "Not open to relocation" },
      { value: "Open within Switzerland", label: "Open within Switzerland" },
      { value: "Open internationally", label: "Open internationally" },
      { value: "Case by case", label: "Case by case" }
    ],
    allowCustom: true
  },
  {
    id: "commuteRadius",
    field: "commuteRadius",
    backstory: "Smart planning! 📍 Commute tolerance helps me match on-site and hybrid roles more accurately. This way, opportunities actually work logistically for you! ✨",
    prompt: "What commute radius feels acceptable to you?",
    placeholder: "Example: Up to 45 minutes, or only within Lausanne",
    allowCustom: true
  },
  {
    id: "currentJobSituation",
    field: "currentJobSituation",
    backstory: "Important context! 💼 Your current situation helps me prioritize what matters most — speed, negotiation, interview prep, or broader exploration. Let's make sure I'm helping you in the right way! 🎯",
    prompt: "What best describes your current situation?",
    options: [
      { value: "Employed, not actively looking", label: "Employed, not actively looking" },
      { value: "Employed, open to opportunities", label: "Employed, open to opportunities" },
      { value: "Actively interviewing", label: "Actively interviewing" },
      { value: "Unemployed and searching", label: "Unemployed and searching" },
      { value: "Student/graduate", label: "Student/graduate" }
    ],
    allowCustom: true
  },
  {
    id: "fullName",
    field: "fullName",
    backstory: "Almost there! 😊 Final identity check so your profile, CV, and all future documents stay consistent. We're building something great! 🚀",
    prompt: "What full name should we store in your profile?",
    placeholder: "Example: Alexia Stoian",
    allowCustom: true
  },
  {
    id: "employmentObjective",
    field: "employmentObjective",
    backstory: "Perfect! 🎯 I'll use your goal to personalize the help I offer after your profile is complete. Let's make sure every next step moves you closer to your goal! 💪",
    prompt: "What is your main goal right now?",
    options: [
      { value: "Find a new job", label: "Find a new job" },
      { value: "Change career direction", label: "Change career direction" },
      { value: "Grow in current field", label: "Grow in current field" },
      { value: "Return to work", label: "Return to work" }
    ],
    allowCustom: true
  },
  {
    id: "primaryRole",
    field: "primaryRole",
    backstory: "If your CV did not make your target role explicit, I still need it before calling the profile complete.",
    prompt: "Which role should we optimize your profile for first?",
    options: [
      { value: "Software Engineer", label: "Software Engineer" },
      { value: "Data Analyst", label: "Data Analyst" },
      { value: "Product Manager", label: "Product Manager" },
      { value: "QA Engineer", label: "QA Engineer" },
      { value: "Project Manager", label: "Project Manager" }
    ],
    placeholder: "Example: Senior Frontend Developer",
    allowCustom: true
  }
];

/**
 * Universal preference fields (D-06), in the order shown to non-engineer users:
 * Current situation, Work rate, Contract type, Work permit, Salary expectation,
 * Preferred location, Commute radius. These reuse the EXISTING
 * POST_CV_PREFERENCE_FLOW question objects verbatim — no new copy — so
 * tone/options stay identical to Phase 5.
 */
const UNIVERSAL_SIX_FIELDS: InteractiveQuestion["field"][] = [
  "currentJobSituation",
  "workRate",
  "contractPreference",
  "workPermitStatus",
  "salaryExpectation",
  "preferredLocation",
  "commuteRadius"
];

/**
 * The universal-6 subset drawn from POST_CV_PREFERENCE_FLOW, ordered per D-06.
 * Built by lookup (not re-authoring) so each question keeps its verbatim
 * prompt/options; any field missing upstream is simply skipped (never throws).
 */
const UNIVERSAL_SIX_FLOW: InteractiveQuestion[] = UNIVERSAL_SIX_FIELDS
  .map((field) => POST_CV_PREFERENCE_FLOW.find((question) => question.field === field))
  .filter((question): question is InteractiveQuestion => question !== undefined);

/**
 * Select the post-CV preference flow based on the resolved sector decision:
 * engineer/default (`usesDefaultFields === true`) keeps the FULL existing flow
 * UNCHANGED (Pitfall 5), while non-engineer users get the universal-6 subset —
 * the ≤3 sector-specific fields are delivered separately in Plan 12-3.
 */
export function selectPostCvPreferenceFlow(usesDefaultFields: boolean): InteractiveQuestion[] {
  return usesDefaultFields ? POST_CV_PREFERENCE_FLOW : UNIVERSAL_SIX_FLOW;
}

type ProfileLike = Partial<Record<InteractiveQuestion["field"], string | null>>;

function hasValue(value: string | null | undefined): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

export function getInteractiveQuestionState(profile: ProfileLike): InteractiveQuestionState {
  return getInteractiveQuestionStateForMode(profile, { hasCvUpload: false });
}

export function getInteractiveQuestionStateForMode(
  profile: ProfileLike,
  options: { hasCvUpload: boolean; usesDefaultFields?: boolean; cvDeclined?: boolean }
): InteractiveQuestionState {
  // Pre-CV: unchanged. Post-CV: when a non-engineer sector has been resolved
  // (usesDefaultFields === false) narrow to the universal-6 subset; otherwise
  // (engineer/default OR no sector decision yet — param omitted) keep the full
  // existing flow so Phase 2/5/10/11 callers are unaffected. When the user has
  // DECLINED a CV (Phase 12), serve the goal question + preferences directly so
  // the flow never dead-ends re-asking for a CV they already declined.
  let flow: InteractiveQuestion[];
  if (options.hasCvUpload) {
    flow = options.usesDefaultFields === false ? UNIVERSAL_SIX_FLOW : POST_CV_PREFERENCE_FLOW;
  } else if (options.cvDeclined) {
    const prefs = options.usesDefaultFields === false ? UNIVERSAL_SIX_FLOW : POST_CV_PREFERENCE_FLOW;
    flow = [...PRE_CV_QUESTION_FLOW, ...prefs];
  } else {
    flow = PRE_CV_QUESTION_FLOW;
  }

  const completedFields = flow
    .filter((question) => hasValue(profile[question.field]))
    .map((question) => question.field);

  const missingFields = flow
    .filter((question) => !hasValue(profile[question.field]))
    .map((question) => question.field);

  const question = flow.find((item) => !hasValue(profile[item.field])) ?? null;

  return {
    question,
    completedFields,
    missingFields,
    done: question === null
  };
}