/**
 * Recruiter-signals canonical registry + shared types.
 *
 * INTERNAL / INVISIBLE MODULE. Nothing exported here may ever be surfaced to the
 * job seeker. These types describe the 11 recruiter-relevant signals that are
 * inferred silently from conversation, forced-choice questions, CV cross-reference,
 * and mock interviews. Values are consumed ONLY by the dev/admin/recruiter layer.
 */

export type SignalCategory = "motivation" | "behavioral" | "skill";

export type EvidenceSource = "message" | "cv" | "mock_interview" | "forced_choice";

/**
 * Origin of a new inference input. Distinct from EvidenceSource: an interactive
 * (forced-choice / multiple-choice) answer arrives as "interactive_answer" but is
 * recorded as "forced_choice" evidence.
 */
export type InferenceSource =
  | "message"
  | "interactive_answer"
  | "mock_interview"
  | "forced_choice"
  | "cv";

/**
 * Map an inference input source to the evidence source used when the model does
 * not cite one explicitly.
 */
export function inferenceSourceToEvidenceSource(source: InferenceSource): EvidenceSource {
  return source === "interactive_answer" ? "forced_choice" : source;
}

export interface EvidenceItem {
  quote: string;
  source: EvidenceSource;
  at: string; // ISO timestamp
}

export interface ContradictionFlag {
  description: string;
  conflicting: string[];
  at: string; // ISO timestamp
}

export interface UpdateEvent {
  at: string; // ISO timestamp
  from: number;
  to: number;
  reason: string;
  sessionId?: string;
}

export interface SignalRecord {
  key: string;
  name: string;
  category: SignalCategory;
  inferredValue: string | null; // e.g. "Technical-growth" | "job-hopper (circumstantial)"
  confidence: number; // 0-100
  evidence: EvidenceItem[];
  contradictionFlags: ContradictionFlag[];
  lastUpdated: string | null; // ISO timestamp
  sessionId: string | null;
  updateHistory: UpdateEvent[];
}

/**
 * Static definition of a signal (its identity — not its inferred state).
 */
export interface SignalDefinition {
  key: string;
  name: string;
  category: SignalCategory;
  description: string;
}

/**
 * The canonical 11-signal registry. Order is stable and used for display.
 */
export const SIGNAL_REGISTRY: readonly SignalDefinition[] = [
  {
    key: "money_driven",
    name: "Money-driven",
    category: "motivation",
    description:
      "Prioritizes compensation; negotiates hard; raises salary/bonus/equity early and unprompted.",
  },
  {
    key: "stability_driven",
    name: "Stability-driven",
    category: "motivation",
    description:
      "Values security, tenure, established companies and low risk over upside.",
  },
  {
    key: "personal_growth_driven",
    name: "Personal-growth-driven",
    category: "motivation",
    description:
      "Motivated by learning, mentorship, and taking on new responsibilities.",
  },
  {
    key: "technical_growth_driven",
    name: "Technical-growth-driven",
    category: "motivation",
    description:
      "Motivated by cutting-edge technology, skill depth, and technical challenge.",
  },
  {
    key: "job_hopper_vs_circumstantial",
    name: "Job-hopper vs. circumstantial",
    category: "behavioral",
    description:
      "CV tenure pattern: frequent moves. Store the REASON (circumstantial vs. restless) in inferredValue.",
  },
  {
    key: "real_vs_stated_motivation",
    name: "Real vs. stated motivation",
    category: "behavioral",
    description:
      "The candidate's true primary driver; flag when it differs from what they claim.",
  },
  {
    key: "stress_behavior",
    name: "Behavior under stress",
    category: "behavioral",
    description:
      "Composure and quality under pressure (mock-interview + pressure/curveball answers).",
  },
  {
    key: "true_vs_claimed_proficiency",
    name: "True vs. claimed proficiency",
    category: "skill",
    description:
      "Gap between CV/self-claimed level and demonstrated depth in conversation.",
  },
  {
    key: "independent_vs_supervised",
    name: "Independent vs. supervised",
    category: "skill",
    description:
      "Autonomy and decision-making style; passive cues like \"we\" vs \"I\" ownership.",
  },
  {
    key: "sustained_vs_fading_effort",
    name: "Sustained vs. fading effort",
    category: "skill",
    description:
      "Follow-through and consistency vs. early-enthusiasm-that-fades over time.",
  },
  {
    key: "overqualified_bored_risk",
    name: "Overqualified / bored risk",
    category: "skill",
    description:
      "Seniority significantly exceeds the target role's demands; boredom/flight risk.",
  },
] as const;

/**
 * The canonical, ordered list of the 11 signal keys.
 */
export const SIGNAL_KEYS: readonly string[] = SIGNAL_REGISTRY.map((s) => s.key);

/**
 * Saturation threshold: at or above this confidence, a signal is only updated
 * on a genuine contradiction.
 */
export const SATURATION_THRESHOLD = 85;

/**
 * Default probe threshold used by question selection: signals at or above this
 * are considered confident enough that we do not need to probe them.
 */
export const PROBE_THRESHOLD = 60;

/**
 * Pure factory: returns the 11 zeroed SignalRecords from the registry. Does NOT
 * touch the database.
 */
export function seedSignals(): SignalRecord[] {
  return SIGNAL_REGISTRY.map((def) => ({
    key: def.key,
    name: def.name,
    category: def.category,
    inferredValue: null,
    confidence: 0,
    evidence: [],
    contradictionFlags: [],
    lastUpdated: null,
    sessionId: null,
    updateHistory: [],
  }));
}
