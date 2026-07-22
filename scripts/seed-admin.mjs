import process from "node:process";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

/**
 * Seed (or reset) the single admin account and demote every other admin.
 *
 * The admin is the ONLY user allowed to see the Admin and Sourcing pages.
 * Idempotent: re-running upserts the admin and re-applies its password/role.
 *
 * Usage:
 *   node scripts/seed-admin.mjs [email] [password]
 * Defaults: admin@gmail.com / wwwwwwww  (dev credentials).
 */

const prisma = new PrismaClient();

async function run() {
  const email = (process.argv[2] ?? "admin@gmail.com").trim().toLowerCase();
  const password = process.argv[3] ?? "wwwwwwww";

  const passwordHash = await bcrypt.hash(password, 12);

  const admin = await prisma.user.upsert({
    where: { email },
    create: {
      email,
      passwordHash,
      role: "ADMIN",
      emailVerified: new Date()
    },
    update: {
      passwordHash,
      role: "ADMIN",
      emailVerified: new Date()
    },
    select: { id: true, email: true, role: true }
  });

  // Ensure the admin is the ONLY admin: demote everyone else.
  const demoted = await prisma.user.updateMany({
    where: { role: "ADMIN", email: { not: email } },
    data: { role: "USER" }
  });

  console.log(`Admin ready: ${admin.email} (${admin.id}) role=${admin.role}`);
  console.log(`Demoted ${demoted.count} other admin account(s) to USER.`);

  await prisma.$disconnect();
}

run().catch(async (error) => {
  console.error("seed-admin failed:", error);
  await prisma.$disconnect();
  process.exit(1);
});
