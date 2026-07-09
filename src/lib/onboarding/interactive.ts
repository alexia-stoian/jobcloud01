export type OnboardingOption = {
  value: string;
  label: string;
  description?: string;
};

export type InteractiveQuestion = {
  id: string;
  field: "fullName" | "currentJobSituation" | "employmentObjective" | "primaryRole" | "preferredLocation" | "contractPreference" | "workRate" | "workPermitStatus" | "salaryExpectation";
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

const QUESTION_FLOW: InteractiveQuestion[] = [
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
  },
  {
    id: "preferredLocation",
    field: "preferredLocation",
    backstory: "Location has a big impact on matching, permits, and salary ranges, so this keeps recommendations realistic.",
    prompt: "Where do you want to work?",
    options: [
      { value: "Zurich", label: "Zurich" },
      { value: "Geneva", label: "Geneva" },
      { value: "Basel", label: "Basel" },
      { value: "Lausanne", label: "Lausanne" },
      { value: "Bern", label: "Bern" },
      { value: "Remote in Switzerland", label: "Remote in Switzerland" }
    ],
    placeholder: "Example: Zurich + hybrid",
    allowCustom: true
  },
  {
    id: "contractPreference",
    field: "contractPreference",
    backstory: "Knowing your contract preference helps avoid roles that look good but do not match your lifestyle or plans.",
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
    backstory: "Your preferred workload helps us target roles that fit your energy, schedule, and expectations.",
    prompt: "What work rate do you want?",
    options: [
      { value: "100%", label: "100% (full-time)" },
      { value: "80-90%", label: "80-90%" },
      { value: "60-70%", label: "60-70%" },
      { value: "Flexible", label: "Flexible" }
    ],
    allowCustom: true
  },
  {
    id: "workPermitStatus",
    field: "workPermitStatus",
    backstory: "I ask this early because work authorization can change what opportunities are available right now.",
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
    id: "salaryExpectation",
    field: "salaryExpectation",
    backstory: "A salary range helps me keep suggestions practical and aligned with your target role and market level.",
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
    id: "currentJobSituation",
    field: "currentJobSituation",
    backstory: "Your current situation helps me decide whether to prioritize speed, interview prep, or profile refinement.",
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
    backstory: "Last quick profile basic so your documents and profile details stay consistent everywhere.",
    prompt: "What full name should we store in your profile?",
    placeholder: "Example: Alexia Stoian",
    allowCustom: true
  }
];

type ProfileLike = Partial<Record<InteractiveQuestion["field"], string | null>>;

function hasValue(value: string | null | undefined): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

export function getInteractiveQuestionState(profile: ProfileLike): InteractiveQuestionState {
  const completedFields = QUESTION_FLOW
    .filter((question) => hasValue(profile[question.field]))
    .map((question) => question.field);

  const missingFields = QUESTION_FLOW
    .filter((question) => !hasValue(profile[question.field]))
    .map((question) => question.field);

  const question = QUESTION_FLOW.find((item) => !hasValue(profile[item.field])) ?? null;

  return {
    question,
    completedFields,
    missingFields,
    done: question === null
  };
}