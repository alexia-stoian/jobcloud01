import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

async function createTestQualifications() {
  // Find the test user
  const user = await db.user.findUnique({
    where: { email: "test@example.com" },
    select: { id: true }
  });

  if (!user) {
    console.error("User not found");
    process.exit(1);
  }

  const userId = user.id;
  console.log("✅ Found user:", userId);

  // Ensure profile exists
  let profile = await db.candidateProfile.findUnique({
    where: { userId }
  });

  if (!profile) {
    profile = await db.candidateProfile.create({
      data: {
        userId,
        fullName: "John Doe",
        primaryRole: "Senior Software Engineer",
        currentJobSituation: "Actively looking",
        employmentObjective: "Find a new job",
        preferredLocation: "San Francisco, CA",
        contractPreference: "Full-time",
        workRate: "100%",
        workPermitStatus: "Valid",
        salaryExpectation: "$150,000 - $180,000"
      }
    });
    console.log("✅ Created profile");
  } else {
    // Update existing profile with test data
    profile = await db.candidateProfile.update({
      where: { userId },
      data: {
        fullName: "John Doe",
        primaryRole: "Senior Software Engineer",
        currentJobSituation: "Actively looking",
        employmentObjective: "Find a new job",
        preferredLocation: "San Francisco, CA",
        contractPreference: "Full-time",
        workRate: "100%",
        workPermitStatus: "Valid",
        salaryExpectation: "$150,000 - $180,000"
      }
    });
    console.log("✅ Updated existing profile");
  }

  // Delete existing qualifications
  await db.profileQualification.deleteMany({
    where: { profileId: profile.id }
  });
  console.log("✅ Cleared existing qualifications");

  // Create test qualifications
  const testQualifications = [
    // Skills
    { category: "skill", value: "React (expert) - 8 yrs" },
    { category: "skill", value: "TypeScript (expert) - 7 yrs" },
    { category: "skill", value: "Node.js (advanced) - 6 yrs" },
    { category: "skill", value: "AWS (intermediate) - 4 yrs" },
    { category: "skill", value: "PostgreSQL (advanced) - 6 yrs" },
    { category: "skill", value: "Docker (intermediate) - 3 yrs" },

    // Education
    { category: "diploma", value: "MIT - Master of Science in Computer Science (2015)" },
    { category: "diploma", value: "Stanford - Bachelor of Science in Engineering (2013)" },

    // Certifications
    { category: "certification", value: "AWS Certified - Amazon (2023)" },
    { category: "certification", value: "Certified Kubernetes Administrator - Linux Foundation (2022)" }
  ];

  for (const qual of testQualifications) {
    await db.profileQualification.create({
      data: {
        profileId: profile.id,
        category: qual.category,
        value: qual.value
      }
    });
  }

  console.log(`✅ Created ${testQualifications.length} qualifications`);
  console.log("✅ Test data created successfully!");
}

createTestQualifications()
  .catch(err => {
    console.error("Error:", err);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
    process.exit(0);
  });
