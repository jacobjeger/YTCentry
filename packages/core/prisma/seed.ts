/**
 * Seed the first ADMIN login (Akiva / IT). There is no email provider and no
 * self-signup — admins are created here or via the dashboard's "create login"
 * action. Run: npm run db:seed (reads SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD).
 */
import argon2 from "argon2";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const email = process.env.SEED_ADMIN_EMAIL ?? "akivajeger@gmail.com";
  const password = process.env.SEED_ADMIN_PASSWORD;
  if (!password) {
    throw new Error(
      "Set SEED_ADMIN_PASSWORD to seed the first admin (and SEED_ADMIN_EMAIL to override the default).",
    );
  }
  const passwordHash = await argon2.hash(password);

  const user = await prisma.staffUser.upsert({
    where: { email },
    update: { passwordHash, role: "ADMIN", active: true },
    create: {
      email,
      name: process.env.SEED_ADMIN_NAME ?? "Akiva",
      passwordHash,
      role: "ADMIN",
    },
  });
  console.log(`Seeded ADMIN ${user.email} (${user.id})`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
