// Creates or promotes the site admin account from environment variables.
// Usage: set ADMIN_PASSWORD (and optionally ADMIN_USERNAME / ADMIN_EMAIL)
// in budtube/.env, then run `npm run db:admin`.
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const db = new PrismaClient();

async function main() {
  const username = (process.env.ADMIN_USERNAME ?? "mcrashcraft").toLowerCase();
  const email = (process.env.ADMIN_EMAIL ?? "support@mcrashcraft.com").toLowerCase();
  const password = process.env.ADMIN_PASSWORD;

  if (!/^[a-z0-9_]{3,20}$/.test(username)) {
    throw new Error("ADMIN_USERNAME must be 3-20 chars: a-z, 0-9, underscore.");
  }
  if (!password || password.length < 8) {
    throw new Error(
      "Set ADMIN_PASSWORD (8+ characters) in budtube/.env before running db:admin."
    );
  }

  const passwordHash = await bcrypt.hash(password, 10);

  // OWNER is the main admin: full staff powers plus role management,
  // and no one can demote it.
  const admin = await db.user.upsert({
    where: { username },
    update: { email, passwordHash, role: "OWNER" },
    create: { username, email, passwordHash, role: "OWNER" },
  });

  console.log(`Admin ready: @${admin.username} <${admin.email}> (role: ${admin.role})`);
}

main()
  .catch((error) => {
    console.error(error.message ?? error);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
