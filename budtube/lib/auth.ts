import { cookies } from "next/headers";
import { SignJWT } from "jose";
import { db } from "@/lib/db";
import {
  SESSION_COOKIE,
  SESSION_DURATION_SECONDS,
  getSessionSecret,
  verifySessionToken,
  type Session,
} from "@/lib/session";

export { SESSION_COOKIE, type Session };

export async function createSession(user: { id: string; username: string }) {
  const token = await new SignJWT({ username: user.username })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DURATION_SECONDS}s`)
    .sign(getSessionSecret());

  cookies().set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: process.env.NODE_ENV === "production",
    maxAge: SESSION_DURATION_SECONDS,
  });
}

export async function getSession(): Promise<Session | null> {
  const token = cookies().get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return verifySessionToken(token);
}

export async function getCurrentUser() {
  const session = await getSession();
  if (!session) return null;
  return db.user.findUnique({ where: { id: session.userId } });
}

export function destroySession() {
  cookies().delete(SESSION_COOKIE);
}
