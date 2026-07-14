import { cookies, headers } from "next/headers";
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

  // Mark the cookie Secure only when the request actually arrived over
  // HTTPS (directly or via a reverse proxy). Keying this off NODE_ENV
  // breaks sign-in when a production build is served over plain HTTP
  // (e.g. hitting the server by IP on a LAN/VPN): browsers silently
  // drop Secure cookies on insecure origins.
  const proto = headers().get("x-forwarded-proto");
  cookies().set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: proto === "https",
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
