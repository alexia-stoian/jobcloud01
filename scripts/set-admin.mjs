import process from "node:process";
import { PrismaClient } from "@prisma/client";

/**
 * Mark a user as an admin by email.
 *
 * Usage:
 *   node scripts/set-admin.mjs alice@example.com
 *
 * Idempotent: running twice is a no-op beyond re-setting the role to ADMIN.
 */

const prisma = new PrismaClient();

async function run() {
  const email = process.argv[2]?.trim();

  if (!email) {
    console.error("Missing email. Usage: node scripts/set-admin.mjs <email>");
    process.exit(1);
  }

  const existing = await prisma.user.findUnique({
    where: { email },
    select: { id: true }
  });

  if (!existing) {
    console.error(`No user found with email "${email}".`);
    process.exit(1);
  }

  const updated = await prisma.user.update({
    where: { email },
    data: { role: "ADMIN" },
    select: { id: true, email: true, role: true }
  });

  console.log(`Updated user ${updated.id} (${updated.email}) -> role: ${updated.role}`);
}

run()
  .catch((error) => {
    console.error("Failed to set admin:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
