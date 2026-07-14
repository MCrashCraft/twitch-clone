// Edge-safe session primitives (no Prisma imports) — used by middleware.
import { jwtVerify } from "jose";

export const SESSION_COOKIE = "budtube_session";

export const SESSION_DURATION_SECONDS = 60 * 60 * 24 * 7; // 7 days

export function getSessionSecret() {
  return new TextEncoder().encode(
    process.env.SESSION_SECRET ?? "budtube-dev-secret-change-me"
  );
}

export type Session = {
  userId: string;
  username: string;
};

export async function verifySessionToken(
  token: string
): Promise<Session | null> {
  try {
    const { payload } = await jwtVerify(token, getSessionSecret());
    if (typeof payload.sub !== "string" || typeof payload.username !== "string") {
      return null;
    }
    return { userId: payload.sub, username: payload.username };
  } catch {
    return null;
  }
}
