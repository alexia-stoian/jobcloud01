const { PrismaClient } = require('@prisma/client');

const db = new PrismaClient();

async function main() {
  try {
    // Get user
    const user = await db.user.findFirst({
      where: { email: "test@example.com" },
      include: { onboardingSession: true, profile: true }
    });

    if (!user) {
      console.log("User not found");
      return;
    }

    console.log("User ID:", user.id);
    console.log("Has profile:", !!user.profile);
    console.log("Has onboarding session:", !!user.onboardingSession);
    console.log("OnboardingSession data:", JSON.stringify(user.onboardingSession, null, 2));

    // Try to find onboarding session separately
    const session = await db.onboardingSession.findUnique({
      where: { userId: user.id }
    });
    console.log("\nDirect query for onboarding session:");
    console.log(JSON.stringify(session, null, 2));

    // Check for any sessions
    const allSessions = await db.onboardingSession.findMany({
      take: 5,
      where: { userId: user.id }
    });
    console.log("\nAll sessions for user:", allSessions.length);
  } catch (err) {
    console.error("Error:", err.message);
  } finally {
    await db.$disconnect();
  }
}

main();
