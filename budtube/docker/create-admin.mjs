// Container-boot version of prisma/create-admin.ts (plain JS, env-driven).
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const db = new PrismaClient();

const username = (process.env.ADMIN_USERNAME ?? "mcrashcraft").toLowerCase();
const email = (process.env.ADMIN_EMAIL ?? "support@mcrashcraft.com").toLowerCase();
const password = process.env.ADMIN_PASSWORD;

if (!/^[a-z0-9_]{3,20}$/.test(username)) {
  console.error("[budtube] ADMIN_USERNAME must be 3-20 chars: a-z, 0-9, _");
  process.exit(1);
}
if (!password || password.length < 8) {
  console.error("[budtube] ADMIN_PASSWORD must be 8+ characters");
  process.exit(1);
}

const passwordHash = await bcrypt.hash(password, 10);
const admin = await db.user.upsert({
  where: { username },
  update: { email, passwordHash, role: "OWNER" },
  create: { username, email, passwordHash, role: "OWNER" },
});
console.log(`[budtube] owner ready: @${admin.username} <${admin.email}>`);
await db.$disconnect();
