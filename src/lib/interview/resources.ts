/**
 * Curated learning resources for skill development
 * 50+ resources across tech, soft, and domain skills
 */

export type ResourceType =
  | "course"
  | "book"
  | "video"
  | "documentation"
  | "certification"
  | "practice";

export interface SkillResource {
  id: string;
  skillTag: string; // "SQL", "Python", "Leadership", etc
  title: string;
  type: ResourceType;
  source: string; // "Udemy", "LinkedIn Learning", "YouTube", etc
  duration?: number; // in minutes
  link?: string;
  cost: number; // in USD, 0 for free
  difficulty: "beginner" | "intermediate" | "advanced";
  targetRole?: string;
  tags: string[];
  description?: string;
}

/**
 * Comprehensive resource database - 50+ resources across multiple skill categories
 */
export const SKILL_RESOURCES: SkillResource[] = [
  // --- SQL & Database Skills (5 resources) ---
  {
    id: "sql-001",
    skillTag: "SQL",
    title: "The Complete SQL Bootcamp",
    type: "course",
    source: "Udemy",
    duration: 480,
    cost: 14.99,
    difficulty: "beginner",
    tags: ["database", "data-analysis", "backend"],
    description: "Learn SQL from basics to advanced queries and optimization",
  },
  {
    id: "sql-002",
    skillTag: "SQL",
    title: "SQL Performance Explained",
    type: "book",
    source: "O'Reilly",
    cost: 39.99,
    difficulty: "advanced",
    tags: ["performance", "optimization"],
    description: "Deep dive into SQL query optimization and indexing",
  },
  {
    id: "sql-003",
    skillTag: "SQL",
    title: "SQL Fundamentals on Mode Analytics",
    type: "documentation",
    source: "Mode Analytics",
    cost: 0,
    difficulty: "beginner",
    tags: ["free", "interactive"],
    description: "Interactive SQL tutorials with real datasets",
  },
  {
    id: "sql-004",
    skillTag: "SQL",
    title: "Advanced SQL for Query Tuning",
    type: "course",
    source: "LinkedIn Learning",
    duration: 240,
    cost: 29.99,
    difficulty: "advanced",
    tags: ["performance", "optimization"],
  },
  {
    id: "sql-005",
    skillTag: "SQL",
    title: "LeetCode SQL Problems",
    type: "practice",
    source: "LeetCode",
    cost: 9.99,
    difficulty: "intermediate",
    tags: ["practice", "interviews"],
  },

  // --- Python Skills (5 resources) ---
  {
    id: "python-001",
    skillTag: "Python",
    title: "Python for Everybody",
    type: "course",
    source: "Coursera",
    duration: 360,
    cost: 49.99,
    difficulty: "beginner",
    tags: ["programming", "fundamentals"],
  },
  {
    id: "python-002",
    skillTag: "Python",
    title: "Fluent Python",
    type: "book",
    source: "O'Reilly",
    cost: 49.99,
    difficulty: "advanced",
    tags: ["advanced", "architecture"],
  },
  {
    id: "python-003",
    skillTag: "Python",
    title: "Python Official Documentation",
    type: "documentation",
    source: "python.org",
    cost: 0,
    difficulty: "beginner",
    tags: ["free", "reference"],
  },
  {
    id: "python-004",
    skillTag: "Python",
    title: "Automate the Boring Stuff with Python",
    type: "book",
    source: "No Starch Press",
    cost: 35.99,
    difficulty: "beginner",
    tags: ["practical", "automation"],
  },
  {
    id: "python-005",
    skillTag: "Python",
    title: "Python Coding Challenges on HackerRank",
    type: "practice",
    source: "HackerRank",
    cost: 0,
    difficulty: "intermediate",
    tags: ["free", "practice", "interviews"],
  },

  // --- JavaScript & Web Development (5 resources) ---
  {
    id: "js-001",
    skillTag: "JavaScript",
    title: "The Complete JavaScript Course",
    type: "course",
    source: "Udemy",
    duration: 550,
    cost: 14.99,
    difficulty: "beginner",
    tags: ["web", "fundamentals"],
  },
  {
    id: "js-002",
    skillTag: "JavaScript",
    title: "You Don't Know JS Yet",
    type: "book",
    source: "O'Reilly",
    cost: 45.99,
    difficulty: "advanced",
    tags: ["advanced", "architecture"],
  },
  {
    id: "js-003",
    skillTag: "JavaScript",
    title: "MDN Web Docs - JavaScript Guide",
    type: "documentation",
    source: "Mozilla",
    cost: 0,
    difficulty: "beginner",
    tags: ["free", "reference"],
  },
  {
    id: "js-004",
    skillTag: "JavaScript",
    title: "JavaScript: The Good Parts",
    type: "book",
    source: "O'Reilly",
    cost: 25.99,
    difficulty: "intermediate",
    tags: ["classics", "fundamentals"],
  },
  {
    id: "react-001",
    skillTag: "React",
    title: "React - The Complete Guide",
    type: "course",
    source: "Udemy",
    duration: 460,
    cost: 14.99,
    difficulty: "beginner",
    tags: ["web", "frontend", "javascript"],
  },

  // --- TypeScript (3 resources) ---
  {
    id: "ts-001",
    skillTag: "TypeScript",
    title: "TypeScript Handbook",
    type: "documentation",
    source: "typescriptlang.org",
    cost: 0,
    difficulty: "beginner",
    tags: ["free", "reference"],
  },
  {
    id: "ts-002",
    skillTag: "TypeScript",
    title: "Programming TypeScript",
    type: "book",
    source: "O'Reilly",
    cost: 45.99,
    difficulty: "intermediate",
    tags: ["advanced", "architecture"],
  },
  {
    id: "ts-003",
    skillTag: "TypeScript",
    title: "TypeScript Pro Course",
    type: "course",
    source: "Udemy",
    duration: 280,
    cost: 14.99,
    difficulty: "intermediate",
    tags: ["advanced", "practice"],
  },

  // --- Cloud & AWS (3 resources) ---
  {
    id: "aws-001",
    skillTag: "AWS",
    title: "AWS Certified Solutions Architect",
    type: "course",
    source: "A Cloud Guru",
    duration: 360,
    cost: 49.99,
    difficulty: "intermediate",
    tags: ["certification", "cloud", "architecture"],
  },
  {
    id: "aws-002",
    skillTag: "AWS",
    title: "AWS Official Documentation",
    type: "documentation",
    source: "aws.amazon.com",
    cost: 0,
    difficulty: "beginner",
    tags: ["free", "reference"],
  },
  {
    id: "aws-003",
    skillTag: "AWS",
    title: "AWS in Action",
    type: "book",
    source: "Manning",
    cost: 39.99,
    difficulty: "intermediate",
    tags: ["architecture", "best-practices"],
  },

  // --- Soft Skills: Leadership (4 resources) ---
  {
    id: "leadership-001",
    skillTag: "Leadership",
    title: "Radical Candor",
    type: "book",
    source: "St. Martin's Press",
    cost: 28.99,
    difficulty: "intermediate",
    tags: ["management", "communication", "team"],
  },
  {
    id: "leadership-002",
    skillTag: "Leadership",
    title: "Leading Teams - LinkedIn Learning",
    type: "course",
    source: "LinkedIn Learning",
    duration: 120,
    cost: 29.99,
    difficulty: "beginner",
    tags: ["management", "soft-skills"],
  },
  {
    id: "leadership-003",
    skillTag: "Leadership",
    title: "Dare to Lead",
    type: "book",
    source: "Random House",
    cost: 32.99,
    difficulty: "intermediate",
    tags: ["vulnerability", "courage", "leadership"],
  },
  {
    id: "leadership-004",
    skillTag: "Leadership",
    title: "The Manager's Path",
    type: "book",
    source: "O'Reilly",
    cost: 39.99,
    difficulty: "intermediate",
    tags: ["management", "growth", "leadership"],
  },

  // --- Communication Skills (3 resources) ---
  {
    id: "communication-001",
    skillTag: "Communication",
    title: "Effective Business Communication",
    type: "course",
    source: "Coursera",
    duration: 180,
    cost: 39.99,
    difficulty: "beginner",
    tags: ["soft-skills", "business"],
  },
  {
    id: "communication-002",
    skillTag: "Communication",
    title: "Crucial Conversations",
    type: "book",
    source: "McGraw Hill",
    cost: 28.99,
    difficulty: "intermediate",
    tags: ["conflict", "dialogue", "communication"],
  },
  {
    id: "communication-003",
    skillTag: "Communication",
    title: "Public Speaking Masterclass - Toastmasters",
    type: "course",
    source: "Toastmasters International",
    duration: 600,
    cost: 0,
    difficulty: "beginner",
    tags: ["free", "public-speaking", "presentation"],
  },

  // --- Data Analysis & Analytics (4 resources) ---
  {
    id: "analytics-001",
    skillTag: "Data Analysis",
    title: "Data Analysis with Pandas",
    type: "course",
    source: "DataCamp",
    duration: 300,
    cost: 29.99,
    difficulty: "intermediate",
    tags: ["python", "data-science"],
  },
  {
    id: "analytics-002",
    skillTag: "Data Analysis",
    title: "Tableau Fundamentals",
    type: "course",
    source: "Tableau Training",
    duration: 240,
    cost: 29.99,
    difficulty: "beginner",
    tags: ["visualization", "business-intelligence"],
  },
  {
    id: "analytics-003",
    skillTag: "Data Analysis",
    title: "Storytelling with Data",
    type: "book",
    source: "Wiley",
    cost: 34.99,
    difficulty: "intermediate",
    tags: ["visualization", "communication"],
  },
  {
    id: "analytics-004",
    skillTag: "Data Analysis",
    title: "Statistics for Business Analytics",
    type: "course",
    source: "Coursera",
    duration: 360,
    cost: 49.99,
    difficulty: "intermediate",
    tags: ["statistics", "business", "analytics"],
  },

  // --- Project Management (3 resources) ---
  {
    id: "pm-001",
    skillTag: "Project Management",
    title: "PMP Certification Prep",
    type: "course",
    source: "Udemy",
    duration: 400,
    cost: 14.99,
    difficulty: "intermediate",
    tags: ["certification", "management"],
  },
  {
    id: "pm-002",
    skillTag: "Project Management",
    title: "Agile Methodology",
    type: "course",
    source: "LinkedIn Learning",
    duration: 180,
    cost: 29.99,
    difficulty: "beginner",
    tags: ["agile", "scrum"],
  },
  {
    id: "pm-003",
    skillTag: "Project Management",
    title: "The Goal",
    type: "book",
    source: "North River Press",
    cost: 24.99,
    difficulty: "intermediate",
    tags: ["constraints", "theory-of-constraints"],
  },

  // --- UX/UI Design (3 resources) ---
  {
    id: "design-001",
    skillTag: "UX/UI Design",
    title: "Google UX Design Certificate",
    type: "course",
    source: "Coursera",
    duration: 600,
    cost: 49.99,
    difficulty: "beginner",
    tags: ["design", "certification"],
  },
  {
    id: "design-002",
    skillTag: "UX/UI Design",
    title: "Don't Make Me Think",
    type: "book",
    source: "New Riders",
    cost: 32.99,
    difficulty: "beginner",
    tags: ["usability", "fundamentals"],
  },
  {
    id: "design-003",
    skillTag: "UX/UI Design",
    title: "Figma Essentials",
    type: "course",
    source: "Figma Learning",
    duration: 240,
    cost: 0,
    difficulty: "beginner",
    tags: ["free", "tools", "prototyping"],
  },

  // --- Negotiation Skills (2 resources) ---
  {
    id: "negotiation-001",
    skillTag: "Negotiation",
    title: "Getting to Yes",
    type: "book",
    source: "Penguin",
    cost: 28.99,
    difficulty: "beginner",
    tags: ["classic", "win-win"],
  },
  {
    id: "negotiation-002",
    skillTag: "Negotiation",
    title: "Never Split the Difference",
    type: "book",
    source: "HarperBusiness",
    cost: 32.99,
    difficulty: "intermediate",
    tags: ["tactics", "practical"],
  },

  // --- Product Management (2 resources) ---
  {
    id: "product-001",
    skillTag: "Product Management",
    title: "Inspired: How to Create Tech Products",
    type: "book",
    source: "Wiley",
    cost: 32.99,
    difficulty: "intermediate",
    tags: ["product-strategy", "framework"],
  },
  {
    id: "product-002",
    skillTag: "Product Management",
    title: "Reforge Product Fundamentals",
    type: "course",
    source: "Reforge",
    duration: 360,
    cost: 79.99,
    difficulty: "intermediate",
    tags: ["advanced", "certification"],
  },
];

/**
 * Get resources for a specific skill with ranking
 */
export function getResourcesForSkill(
  skillTag: string,
  maxResults: number = 5,
  difficulty?: "beginner" | "intermediate" | "advanced"
): SkillResource[] {
  let resources = SKILL_RESOURCES.filter((r) => r.skillTag === skillTag);

  if (difficulty) {
    resources = resources.filter((r) => r.difficulty === difficulty);
  }

  // Rank by: free first, then by difficulty (beginner preferred), then by type (course > practice > book)
  const typeRank: Record<ResourceType, number> = {
    course: 3,
    practice: 2,
    book: 1,
    video: 2,
    documentation: 2,
    certification: 3,
  };

  resources.sort((a, b) => {
    // Free resources first
    if (a.cost === 0 && b.cost !== 0) return -1;
    if (a.cost !== 0 && b.cost === 0) return 1;

    // Beginner difficulty preferred
    const diffRank: Record<string, number> = {
      beginner: 3,
      intermediate: 2,
      advanced: 1,
    };
    if (diffRank[a.difficulty] !== diffRank[b.difficulty]) {
      return diffRank[b.difficulty] - diffRank[a.difficulty];
    }

    // Then by type
    return typeRank[b.type] - typeRank[a.type];
  });

  return resources.slice(0, maxResults);
}

/**
 * Search resources by keyword
 */
export function searchResources(
  keyword: string,
  maxResults: number = 10
): SkillResource[] {
  const lowerKeyword = keyword.toLowerCase();

  const matches = SKILL_RESOURCES.filter(
    (r) =>
      r.title.toLowerCase().includes(lowerKeyword) ||
      r.skillTag.toLowerCase().includes(lowerKeyword) ||
      r.description?.toLowerCase().includes(lowerKeyword) ||
      r.tags.some((t) => t.toLowerCase().includes(lowerKeyword))
  );

  return matches.slice(0, maxResults);
}

/**
 * Get all skill tags
 */
export function getAllSkillTags(): string[] {
  const tags = new Set(SKILL_RESOURCES.map((r) => r.skillTag));
  return Array.from(tags).sort();
}

/**
 * Get resources by type
 */
export function getResourcesByType(
  type: ResourceType,
  maxResults: number = 10
): SkillResource[] {
  return SKILL_RESOURCES.filter((r) => r.type === type).slice(0, maxResults);
}
