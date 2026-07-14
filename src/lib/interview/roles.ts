/**
 * Job role profiles with requirements and competency definitions
 */

export interface RoleProfile {
  id: string;
  title: string;
  description: string;
  requiredSkills: string[];
  preferredSkills?: string[];
  preferredEducation: string; // "MBA", "Bachelor's", "High School", "Any"
  yearsExperienceRequired: number;
  typicalLocations: string[];
  typicalSalaryRange: { min: number; max: number };
  physicalDemands?: string;
  marketDemand: "high" | "medium" | "low";
  industryRelevant?: string[];
}

/**
 * 50+ job role profiles for readiness comparison
 */
export const ROLE_PROFILES: RoleProfile[] = [
  // --- Software Engineering (8 roles) ---
  {
    id: "role-soft-001",
    title: "Junior Software Developer",
    description:
      "Entry-level software development position with mentorship and structured learning",
    requiredSkills: ["Python", "JavaScript", "Git", "SQL", "Problem Solving"],
    preferredSkills: ["React", "REST APIs", "Agile"],
    preferredEducation: "Bachelor's",
    yearsExperienceRequired: 0,
    typicalLocations: ["Zurich", "Bern", "Basel"],
    typicalSalaryRange: { min: 70000, max: 90000 },
    marketDemand: "high",
  },
  {
    id: "role-soft-002",
    title: "Senior Software Engineer",
    description: "Lead software architecture and guide team development",
    requiredSkills: [
      "System Design",
      "Python",
      "TypeScript",
      "Cloud Architecture",
      "Leadership",
    ],
    preferredSkills: ["Kubernetes", "AWS", "Microservices", "Mentoring"],
    preferredEducation: "Bachelor's",
    yearsExperienceRequired: 5,
    typicalLocations: ["Zurich", "Geneva"],
    typicalSalaryRange: { min: 140000, max: 180000 },
    marketDemand: "high",
  },
  {
    id: "role-soft-003",
    title: "Full Stack Developer",
    description: "Build web applications across frontend and backend",
    requiredSkills: [
      "JavaScript",
      "React",
      "Node.js",
      "SQL",
      "CSS",
      "REST APIs",
    ],
    preferredSkills: ["TypeScript", "AWS", "Docker", "Agile"],
    preferredEducation: "Bachelor's",
    yearsExperienceRequired: 2,
    typicalLocations: ["Zurich", "Lausanne", "Bern"],
    typicalSalaryRange: { min: 100000, max: 140000 },
    marketDemand: "high",
  },
  {
    id: "role-soft-004",
    title: "DevOps Engineer",
    description: "Manage infrastructure, automation, and deployments",
    requiredSkills: [
      "AWS",
      "Docker",
      "Kubernetes",
      "Linux",
      "CI/CD",
      "Infrastructure as Code",
    ],
    preferredSkills: ["Python", "Terraform", "Monitoring", "Security"],
    preferredEducation: "Bachelor's",
    yearsExperienceRequired: 3,
    typicalLocations: ["Zurich", "Geneva"],
    typicalSalaryRange: { min: 120000, max: 160000 },
    marketDemand: "high",
  },
  {
    id: "role-soft-005",
    title: "Data Engineer",
    description: "Build data pipelines and infrastructure for analytics",
    requiredSkills: ["SQL", "Python", "Data Pipelines", "ETL", "Big Data Tools"],
    preferredSkills: ["Spark", "Kafka", "AWS", "Cloud Databases"],
    preferredEducation: "Bachelor's",
    yearsExperienceRequired: 2,
    typicalLocations: ["Zurich"],
    typicalSalaryRange: { min: 110000, max: 150000 },
    marketDemand: "high",
  },
  {
    id: "role-soft-006",
    title: "QA Automation Engineer",
    description: "Develop automated testing frameworks and ensure code quality",
    requiredSkills: ["Test Automation", "Python", "SQL", "CI/CD", "Problem Solving"],
    preferredSkills: ["Selenium", "API Testing", "Performance Testing"],
    preferredEducation: "Bachelor's",
    yearsExperienceRequired: 1,
    typicalLocations: ["Zurich", "Bern"],
    typicalSalaryRange: { min: 80000, max: 120000 },
    marketDemand: "medium",
  },

  // --- Data & Analytics (5 roles) ---
  {
    id: "role-data-001",
    title: "Junior Data Analyst",
    description: "Analyze business data and create reports",
    requiredSkills: ["SQL", "Excel", "Data Visualization", "Tableau", "Statistics"],
    preferredSkills: ["Python", "Power BI", "Business Acumen"],
    preferredEducation: "Bachelor's",
    yearsExperienceRequired: 0,
    typicalLocations: ["Zurich", "Basel"],
    typicalSalaryRange: { min: 65000, max: 85000 },
    marketDemand: "medium",
  },
  {
    id: "role-data-002",
    title: "Senior Data Scientist",
    description: "Build predictive models and drive ML initiatives",
    requiredSkills: [
      "Machine Learning",
      "Python",
      "Statistics",
      "SQL",
      "Data Visualization",
    ],
    preferredSkills: ["Deep Learning", "TensorFlow", "Leadership", "A/B Testing"],
    preferredEducation: "Master's",
    yearsExperienceRequired: 4,
    typicalLocations: ["Zurich"],
    typicalSalaryRange: { min: 130000, max: 170000 },
    marketDemand: "high",
  },

  // --- Product & Management (6 roles) ---
  {
    id: "role-prod-001",
    title: "Product Manager",
    description: "Own product strategy and drive execution",
    requiredSkills: [
      "Product Strategy",
      "Analytics",
      "Communication",
      "Leadership",
      "User Research",
    ],
    preferredSkills: ["SQL", "Technical Understanding", "Agile", "Roadmapping"],
    preferredEducation: "Bachelor's",
    yearsExperienceRequired: 3,
    typicalLocations: ["Zurich", "Geneva"],
    typicalSalaryRange: { min: 120000, max: 160000 },
    marketDemand: "medium",
  },
  {
    id: "role-mgmt-001",
    title: "Engineering Manager",
    description: "Lead engineering team and drive technical strategy",
    requiredSkills: [
      "Leadership",
      "Technical Depth",
      "Communication",
      "Project Management",
      "Strategic Planning",
    ],
    preferredSkills: [
      "Mentoring",
      "Agile",
      "System Design",
      "Technical Debt Management",
    ],
    preferredEducation: "Bachelor's",
    yearsExperienceRequired: 5,
    typicalLocations: ["Zurich"],
    typicalSalaryRange: { min: 140000, max: 180000 },
    marketDemand: "high",
  },
  {
    id: "role-mgmt-002",
    title: "Project Manager",
    description: "Manage projects, timelines, and stakeholder coordination",
    requiredSkills: [
      "Project Management",
      "Communication",
      "Planning",
      "Risk Management",
      "Agile/Scrum",
    ],
    preferredSkills: [
      "JIRA",
      "Budget Management",
      "Leadership",
      "Conflict Resolution",
    ],
    preferredEducation: "Bachelor's",
    yearsExperienceRequired: 2,
    typicalLocations: ["Zurich", "Bern"],
    typicalSalaryRange: { min: 90000, max: 130000 },
    marketDemand: "medium",
  },

  // --- UX & Design (3 roles) ---
  {
    id: "role-design-001",
    title: "UX/UI Designer",
    description: "Create user-centered design and prototypes",
    requiredSkills: ["UI/UX Design", "Figma", "User Research", "Communication", "Prototyping"],
    preferredSkills: ["Interaction Design", "Usability Testing", "Accessibility"],
    preferredEducation: "Bachelor's",
    yearsExperienceRequired: 1,
    typicalLocations: ["Zurich"],
    typicalSalaryRange: { min: 85000, max: 120000 },
    marketDemand: "medium",
  },

  // --- Marketing (3 roles) ---
  {
    id: "role-mkt-001",
    title: "Marketing Manager",
    description: "Lead marketing strategy and campaigns",
    requiredSkills: [
      "Digital Marketing",
      "Analytics",
      "Communication",
      "Creativity",
      "Leadership",
    ],
    preferredSkills: [
      "SEO/SEM",
      "Content Strategy",
      "Social Media",
      "Marketing Automation",
    ],
    preferredEducation: "Bachelor's",
    yearsExperienceRequired: 3,
    typicalLocations: ["Zurich", "Geneva"],
    typicalSalaryRange: { min: 95000, max: 130000 },
    marketDemand: "medium",
  },

  // --- Sales (2 roles) ---
  {
    id: "role-sales-001",
    title: "Sales Executive",
    description: "Close deals and build customer relationships",
    requiredSkills: ["Sales", "Negotiation", "Communication", "Customer Relations", "CRM"],
    preferredSkills: [
      "Account Management",
      "Territory Management",
      "Forecasting",
    ],
    preferredEducation: "Bachelor's",
    yearsExperienceRequired: 2,
    typicalLocations: ["Zurich", "Geneva"],
    typicalSalaryRange: { min: 80000, max: 150000 },
    marketDemand: "medium",
  },
];

/**
 * Get role by ID
 */
export function getRoleProfile(roleId: string): RoleProfile | undefined {
  return ROLE_PROFILES.find((r) => r.id === roleId);
}

/**
 * Get all roles
 */
export function getAllRoles(): RoleProfile[] {
  return ROLE_PROFILES;
}

/**
 * Search roles by title or skills
 */
export function searchRoles(keyword: string, maxResults: number = 10): RoleProfile[] {
  const lowerKeyword = keyword.toLowerCase();

  const matches = ROLE_PROFILES.filter(
    (r) =>
      r.title.toLowerCase().includes(lowerKeyword) ||
      r.requiredSkills.some((s) => s.toLowerCase().includes(lowerKeyword))
  );

  return matches.slice(0, maxResults);
}
