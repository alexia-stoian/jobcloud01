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
    backstory: "So I can tailor every next step to what you actually want, let us align on your main direction first.",
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
    backstory: "This helps me filter advice, CV wording, and interview preparation around the role you care about most.",
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
    backstory: "I filled what I could from your CV. Now I will finish the profile by locking in the preferences that matter most for matching.",
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
    backstory: "To complete your preference profile, I need to know which roles you want to be considered for, not just your current title.",
    prompt: "Which roles should your profile target?",
    placeholder: "Example: Product Manager, Senior Product Manager",
    allowCustom: true
  },
  {
    id: "targetSeniority",
    field: "targetSeniority",
    backstory: "Seniority helps me avoid mismatches between your experience and the roles you see.",
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
    backstory: "Industry preferences help me prioritize the right companies and examples when I help further.",
    prompt: "Which industries are you most interested in?",
    placeholder: "Example: SaaS, fintech, healthcare, climate tech",
    allowCustom: true
  },
  {
    id: "preferredWorkModel",
    field: "preferredWorkModel",
    backstory: "Work model is part of a complete profile because it strongly affects fit and shortlist quality.",
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
    backstory: "Contract preference lets me filter out roles that look good on paper but do not fit your plan.",
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
    backstory: "Your preferred workload is part of a complete profile because many roles in Switzerland are filtered by percentage.",
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
    backstory: "Salary preference helps me keep role suggestions realistic and aligned with your market level.",
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
    backstory: "Work authorization is critical to a complete Swiss job-search profile because it changes which roles are realistic right now.",
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
    backstory: "Sponsorship expectations help avoid role suggestions that are unrealistic from the start.",
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
    backstory: "Relocation openness changes which opportunities I should surface and how broadly I should search.",
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
    backstory: "Commute tolerance helps me match on-site and hybrid roles more accurately.",
    prompt: "What commute radius feels acceptable to you?",
    placeholder: "Example: Up to 45 minutes, or only within Lausanne",
    allowCustom: true
  },
  {
    id: "currentJobSituation",
    field: "currentJobSituation",
    backstory: "Your current situation changes whether I should prioritize speed, negotiation, interview prep, or broader exploration.",
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
    backstory: "Last identity check so your profile, CV, and future documents all stay consistent.",
    prompt: "What full name should we store in your profile?",
    placeholder: "Example: Alexia Stoian",
    allowCustom: true
  },
  {
    id: "employmentObjective",
    field: "employmentObjective",
    backstory: "I use your goal to personalize the next help I offer after your profile is complete.",
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

type ProfileLike = Partial<Record<InteractiveQuestion["field"], string | null>>;

function hasValue(value: string | null | undefined): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

export function getInteractiveQuestionState(profile: ProfileLike): InteractiveQuestionState {
  return getInteractiveQuestionStateForMode(profile, { hasCvUpload: false });
}

export function getInteractiveQuestionStateForMode(
  profile: ProfileLike,
  options: { hasCvUpload: boolean }
): InteractiveQuestionState {
  const flow = options.hasCvUpload
    ? POST_CV_PREFERENCE_FLOW
    : PRE_CV_QUESTION_FLOW;

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