import { beforeEach, describe, expect, test, vi } from "vitest";

const authMock = vi.hoisted(() => vi.fn());
const isJobDomainMessageMock = vi.hoisted(() => vi.fn());
const buildDurableProfileMemoryMock = vi.hoisted(() => vi.fn());

const dbMock = vi.hoisted(() => ({
  candidateProfile: {
    findUnique: vi.fn(),
    update: vi.fn()
  }
}));

vi.mock("@/auth/config", () => ({ auth: authMock }));
vi.mock("@/lib/db", () => ({ db: dbMock }));
vi.mock("@/lib/env", () => ({ env: { ANTHROPIC_API_KEY: "test-key", ANTHROPIC_MODEL: "claude-test", AWS_BEARER_TOKEN_BEDROCK: "test-bedrock-key", BEDROCK_REGION: "eu-west-1", BEDROCK_MODEL_ID: "eu.anthropic.claude-sonnet-5" } }));
vi.mock("@/lib/ai/domain-guard", () => ({ isJobDomainMessage: isJobDomainMessageMock, OFF_TOPIC_RESPONSE: "off-topic" }));
vi.mock("@/lib/profile/memory", () => ({ buildDurableProfileMemory: buildDurableProfileMemoryMock }));

import { POST } from "@/app/api/onboarding/assistant/route";

type AnyObj = Record<string, unknown>;

function baseProfile(editorDraft: AnyObj = {}): AnyObj {
  return {
    id: "profile-1",
    userId: "user-1",
    fullName: "Candidate",
    primaryRole: "Professional",
    targetRoles: "Professional",
    preferredLocation: "Remote",
    salaryExpectation: null,
    workPermitStatus: null,
    currentJobSituation: "Open to opportunities",
    workRate: "100%",
    editorDraft,
    qualifications: [],
    onboardingSession: {
      cvFileName: "cv.pdf",
      cvExtractedFacts: {}
    }
  };
}

async function requestCoverLetter(message: string): Promise<string> {
  const response = await POST(new Request("http://localhost/api/onboarding/assistant", {
    method: "POST",
    body: JSON.stringify({ message })
  }) as never);

  expect(response.status).toBe(200);
  const payload = await response.json();
  expect(typeof payload.answer).toBe("string");
  return payload.answer as string;
}

describe("cover letter self-testing and auto-debugging scenarios", () => {
  let editorDraft: AnyObj;

  beforeEach(() => {
    vi.clearAllMocks();
    editorDraft = {};

    authMock.mockResolvedValue({ user: { id: "user-1" } });
    isJobDomainMessageMock.mockReturnValue(true);
    buildDurableProfileMemoryMock.mockReturnValue({
      profile: {
        employmentObjective: "Find a strong role",
        primaryRole: "Professional",
        preferredLocation: "Remote",
        currentJobSituation: "Open to opportunities",
        contractPreference: "Full-time",
        workRate: "100%",
        workPermitStatus: "Eligible",
        salaryExpectation: "market"
      },
      qualifications: []
    });

    dbMock.candidateProfile.update.mockImplementation(async ({ data }: { data: AnyObj }) => {
      editorDraft = (data.editorDraft as AnyObj) ?? editorDraft;
      return { id: "profile-1", editorDraft };
    });

    // Force deterministic generation path for stable assertions.
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("network disabled in test"); }));
  });

  test("Scenario 1: Senior Software Engineer at AWS", async () => {
    dbMock.candidateProfile.findUnique.mockResolvedValue({
      ...baseProfile(editorDraft),
      fullName: "John Smith",
      primaryRole: "Senior Software Engineer",
      preferredLocation: "Seattle, WA",
      qualifications: [
        { category: "experience", value: "7 years software development experience" },
        { category: "skill", value: "Python" },
        { category: "skill", value: "Java" },
        { category: "skill", value: "Distributed systems" },
        { category: "skill", value: "AWS" },
        { category: "project", value: "Led microservices architecture serving 2M+ users" },
        { category: "achievement", value: "Reduced system latency by 65% through distributed caching" },
        { category: "leadership", value: "Mentored 3 junior engineers" },
        { category: "education", value: "B.S. Computer Science (2016)" },
        { category: "experience", value: "Senior Software Engineer at TechStartup Inc. (2019-Present)" },
        { category: "experience", value: "Software Engineer at DataCorp (2016-2019)" }
      ],
      onboardingSession: {
        cvFileName: "john-cv.pdf",
        cvExtractedFacts: {
          experience: [
            "Senior Software Engineer at TechStartup Inc. (2019-Present)",
            "Software Engineer at DataCorp (2016-2019)"
          ],
          projects: ["Led microservices architecture serving 2M+ users"],
          skills: ["Python", "Java", "AWS", "Docker", "Kubernetes", "Distributed systems", "Microservices"],
          education: ["B.S. Computer Science (2016)"]
        }
      }
    });

    const message = [
      "Write a cover letter for this job posting:",
      "Senior Software Engineer - Amazon Web Services (AWS)",
      "Location: Seattle, WA",
      "Requirements:",
      "- 5+ years software development experience",
      "- Strong proficiency in Java, Python, or C++",
      "- Experience with distributed systems",
      "- Cloud technologies (AWS, Azure, or GCP)",
      "- Bachelor's in Computer Science",
      "- Led technical projects",
      "Preferred:",
      "- Microservices architecture",
      "- Docker, Kubernetes",
      "- System design skills",
      "- Mentoring experience",
      "About AWS: Building the future of cloud computing. We value innovation, ownership, and customer obsession."
    ].join("\n");

    const answer = await requestCoverLetter(message);

    expect(answer).toMatch(/Senior Software Engineer.*Amazon Web Services|AWS/i);
    expect(answer).toMatch(/7 years/i);
    expect(answer).toMatch(/65%|2M\+/i);
    expect(answer).toMatch(/distributed systems/i);
    expect(answer).toMatch(/AWS/i);
    expect(answer).toMatch(/microservices/i);
    expect(answer).toMatch(/mentor|mentoring/i);
    expect(answer).toMatch(/innovation|ownership|customer obsession/i);
    expect(answer).toMatch(/TechStartup Inc\./i);
    expect(answer).not.toMatch(/hard worker|passionate about technology/i);
  });

  test("Scenario 2: Digital Marketing Manager", async () => {
    dbMock.candidateProfile.findUnique.mockResolvedValue({
      ...baseProfile(editorDraft),
      fullName: "Sarah Johnson",
      primaryRole: "Digital Marketing Manager",
      preferredLocation: "Portland, OR",
      qualifications: [
        { category: "experience", value: "4+ years digital marketing experience" },
        { category: "experience", value: "Social Media Coordinator at GreenTech Solutions (2020-Present)" },
        { category: "achievement", value: "Increased Instagram engagement by 85% and gained 12K followers in 18 months" },
        { category: "achievement", value: "Managed $15K monthly social budget" },
        { category: "skill", value: "Google Analytics" },
        { category: "skill", value: "Content creation and copywriting" },
        { category: "skill", value: "Mailchimp" },
        { category: "project", value: "Created 200+ environmental tech content pieces" },
        { category: "experience", value: "Volunteer contributor at environmental nonprofit" }
      ],
      onboardingSession: {
        cvFileName: "sarah-cv.pdf",
        cvExtractedFacts: {
          experience: [
            "Social Media Coordinator at GreenTech Solutions (2020-Present)",
            "Marketing Assistant at RetailCo (2019-2020)"
          ],
          skills: ["Social Media", "Google Analytics", "Content Creation", "Copywriting", "Mailchimp", "SEO", "Budget Management"],
          projects: ["Managed social campaigns for eco-conscious audiences"],
          education: ["B.A. Marketing (2019)"]
        }
      }
    });

    const message = [
      "Need a cover letter for:",
      "Digital Marketing Manager - EcoHome Products",
      "Location: Portland, OR",
      "We're a sustainable home goods company seeking a Digital Marketing Manager.",
      "Requirements:",
      "- 3+ years digital marketing",
      "- Social media campaign success",
      "- Google Analytics & data-driven decisions",
      "- Content creation & copywriting",
      "- Budget management",
      "- Project management",
      "Preferred:",
      "- E-commerce experience",
      "- SEO/SEM knowledge",
      "- Passion for sustainability",
      "- Email marketing (Mailchimp, HubSpot)",
      "Grow our online presence and engage our eco-conscious community with measurable results."
    ].join("\n");

    const answer = await requestCoverLetter(message);

    expect(answer).toMatch(/Digital Marketing Manager.*EcoHome Products/i);
    expect(answer).toMatch(/GreenTech/i);
    expect(answer).toMatch(/85%|12K|\$15K/i);
    expect(answer).toMatch(/Google Analytics/i);
    expect(answer).toMatch(/budget/i);
    expect(answer).toMatch(/Mailchimp/i);
    expect(answer).toMatch(/environmental nonprofit|sustainab/i);
    expect(answer).toMatch(/eco-conscious community|eco-conscious/i);
    expect(answer).toMatch(/4\+ years|4 years/i);
    expect(answer).toMatch(/sustainab/i);
  });

  test("Scenario 3: Junior Data Analyst entry-level", async () => {
    dbMock.candidateProfile.findUnique.mockResolvedValue({
      ...baseProfile(editorDraft),
      fullName: "Alex Chen",
      primaryRole: "Junior Data Analyst",
      preferredLocation: "New York, NY",
      qualifications: [
        { category: "experience", value: "Data Analytics Intern at LocalBank (Summer 2023)" },
        { category: "achievement", value: "Identified trend reducing customer churn by 8%" },
        { category: "skill", value: "SQL" },
        { category: "skill", value: "Excel (pivot tables, VLOOKUP, visualization)" },
        { category: "skill", value: "Python, R, Tableau" },
        { category: "education", value: "B.S. Statistics (2023), GPA 3.7" },
        { category: "project", value: "Stock Market Analysis using Python with 72% prediction accuracy on 5 years financial data" },
        { category: "communication", value: "Presented findings to senior leadership" }
      ],
      onboardingSession: {
        cvFileName: "alex-cv.pdf",
        cvExtractedFacts: {
          experience: [
            "Data Analytics Intern at LocalBank (Summer 2023)",
            "Research Assistant at University Stats Lab (2022-2023)"
          ],
          skills: ["SQL", "Excel", "Python", "R", "Tableau", "Statistical Analysis"],
          projects: ["Created weekly dashboards", "Stock Market Analysis project with financial data"],
          education: ["B.S. Statistics (2023), GPA 3.7"]
        }
      }
    });

    const message = [
      "Create a cover letter for this role:",
      "Junior Data Analyst - FinanceFlow Inc.",
      "Location: New York, NY",
      "Requirements:",
      "- Bachelor's in Statistics, Math, CS, or related",
      "- SQL proficiency",
      "- Excel (pivot tables, VLOOKUP, visualization)",
      "- Analytical & problem-solving skills",
      "- Strong communication",
      "- Fast-paced environment",
      "Preferred:",
      "- Data analysis internship or coursework",
      "- Python or R",
      "- Tableau or Power BI",
      "- Financial data understanding",
      "Great opportunity for recent graduates!"
    ].join("\n");

    const answer = await requestCoverLetter(message);

    expect(answer).toMatch(/Junior Data Analyst.*FinanceFlow Inc\./i);
    expect(answer).toMatch(/recent graduate/i);
    expect(answer).toMatch(/SQL.*LocalBank|LocalBank.*SQL/i);
    expect(answer).toMatch(/Excel/i);
    expect(answer).toMatch(/8%/i);
    expect(answer).toMatch(/Python|Tableau/i);
    expect(answer).toMatch(/financial data|LocalBank|Stock Market/i);
    expect(answer).toMatch(/presented.*leadership|communication/i);
    expect(answer).not.toMatch(/underqualified|inexperienced and/i);
  });

  test("Scenario 4: Career change Teacher to Corporate Training", async () => {
    dbMock.candidateProfile.findUnique.mockResolvedValue({
      ...baseProfile(editorDraft),
      fullName: "Maria Rodriguez",
      primaryRole: "Corporate Training Specialist",
      preferredLocation: "Austin, TX",
      qualifications: [
        { category: "experience", value: "5+ years training experience" },
        { category: "experience", value: "High School Math Teacher (2018-Present)" },
        { category: "achievement", value: "Increased student test scores by 23% over 2 years" },
        { category: "project", value: "Developed curriculum for 150+ students annually" },
        { category: "leadership", value: "Trained 5 new teachers" },
        { category: "skill", value: "Canvas LMS daily use" },
        { category: "communication", value: "Presented at 3 state education conferences" },
        { category: "experience", value: "Tutored adults returning to college via Zoom" },
        { category: "certification", value: "Google IT Support Certificate (2023)" }
      ],
      onboardingSession: {
        cvFileName: "maria-cv.pdf",
        cvExtractedFacts: {
          experience: ["High School Math Teacher (2018-Present)", "Freelance Tutor (2020-Present)"],
          skills: ["Curriculum Development", "Public Speaking", "LMS (Canvas, Moodle)", "Zoom", "Adult Education", "Training"],
          education: ["B.A. Mathematics Education (2018)"],
          certifications: ["Google IT Support Certificate (2023)"]
        }
      }
    });

    const message = [
      "Write a cover letter for:",
      "Corporate Training Specialist - TechCorp",
      "Location: Austin, TX",
      "Requirements:",
      "- 3+ years training or teaching experience",
      "- Curriculum development",
      "- Presentation skills",
      "- Adult learning principles",
      "- LMS experience (Learning Management Systems)",
      "- Ability to train technical topics",
      "Preferred:",
      "- Corporate training background",
      "- Instructional design certification",
      "- Experience with virtual training platforms (Zoom, Teams)",
      "- Tech industry experience"
    ].join("\n");

    const answer = await requestCoverLetter(message);

    expect(answer).toMatch(/Corporate Training Specialist.*TechCorp/i);
    expect(answer).toMatch(/transitioning from|transferable/i);
    expect(answer).toMatch(/5\+ years|5 years/i);
    expect(answer).toMatch(/curriculum/i);
    expect(answer).toMatch(/23%/i);
    expect(answer).toMatch(/adult/i);
    expect(answer).toMatch(/Canvas|LMS/i);
    expect(answer).toMatch(/5 new teachers/i);
    expect(answer).toMatch(/Zoom/i);
    expect(answer).toMatch(/Google IT Support/i);
    expect(answer).toMatch(/conferences|presentation/i);
    expect(answer).not.toMatch(/sorry|despite lacking/i);
  });

  test("Scenario 5: Gap handling without fabrication", async () => {
    dbMock.candidateProfile.findUnique.mockResolvedValue({
      ...baseProfile(editorDraft),
      fullName: "David Kim",
      primaryRole: "Project Manager",
      preferredLocation: "Denver, CO",
      qualifications: [
        { category: "experience", value: "4 years project management and construction coordination experience" },
        { category: "experience", value: "Assistant Project Manager at SmallBuild Co. (2020-Present)" },
        { category: "experience", value: "Construction Coordinator at HomeBuilders Inc. (2018-2020)" },
        { category: "achievement", value: "Reduced material waste by 15% through better planning" },
        { category: "project", value: "Tracked project budgets up to $500K" },
        { category: "leadership", value: "Coordinated teams of 6-8 subcontractors" },
        { category: "skill", value: "Risk management and stakeholder communication" }
      ],
      onboardingSession: {
        cvFileName: "david-cv.pdf",
        cvExtractedFacts: {
          experience: [
            "Assistant Project Manager at SmallBuild Co. (2020-Present)",
            "Construction Coordinator at HomeBuilders Inc. (2018-2020)"
          ],
          skills: ["Project Management", "Budgeting", "Team Coordination", "Construction", "Scheduling", "MS Project"],
          projects: ["Assisted on 8 commercial construction projects"],
          education: ["B.S. Civil Engineering (2018)"]
        }
      }
    });

    const message = [
      "Please generate a cover letter for:",
      "Project Manager - BuildRight Construction",
      "Location: Denver, CO",
      "Requirements:",
      "- 5+ years project management",
      "- PMP certification preferred",
      "- Budget management ($1M+ projects)",
      "- Team leadership (10+ people)",
      "- Construction industry experience",
      "- Risk management",
      "- Stakeholder communication"
    ].join("\n");

    const answer = await requestCoverLetter(message);

    expect(answer).toMatch(/Project Manager.*BuildRight Construction/i);
    expect(answer).toMatch(/4 years/i);
    expect(answer).toMatch(/\$500K/i);
    expect(answer).toMatch(/6-8 subcontractors|6-8/i);
    expect(answer).toMatch(/15%/i);
    expect(answer).toMatch(/SmallBuild Co\.|HomeBuilders Inc\./i);
    expect(answer).toMatch(/not yet completed PMP|pursuing/i);
    expect(answer).toMatch(/larger|scale|grow/i);
    expect(answer).not.toMatch(/PMP certified/i);
    expect(answer).not.toMatch(/hard worker|generic/i);
  });
});
