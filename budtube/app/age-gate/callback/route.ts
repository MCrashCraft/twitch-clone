import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getDiditDecision } from "@/lib/didit";
import { parseBirthDate, isOfAge, MIN_AGE } from "@/lib/age";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function gateRedirect(request: NextRequest, next: string, error?: string) {
  const url = request.nextUrl.clone();
  url.pathname = "/age-gate";
  url.search = "";
  url.searchParams.set("next", next);
  if (error) url.searchParams.set("error", error);
  return NextResponse.redirect(url);
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const sessionId = params.get("verificationSessionId");
  const nextRaw = params.get("next") ?? "/";
  const next =
    nextRaw.startsWith("/") && !nextRaw.startsWith("//") ? nextRaw : "/";

  if (!sessionId) return gateRedirect(request, next, "id_failed");

  // Only accept sessions we created ourselves.
  const record = await db.verificationSession.findUnique({
    where: { sessionId },
  });
  if (!record) return gateRedirect(request, next, "id_failed");

  let decision;
  try {
    decision = await getDiditDecision(sessionId);
  } catch (error) {
    console.error("Didit decision fetch failed:", error);
    return gateRedirect(request, next, "id_failed");
  }

  await db.verificationSession.update({
    where: { sessionId },
    data: { status: decision.status },
  });

  if (decision.status !== "Approved") {
    const error =
      decision.status === "Declined" ? "id_declined" : "id_pending";
    return gateRedirect(request, next, error);
  }

  const ofAge =
    (decision.age !== null && decision.age >= MIN_AGE) ||
    (decision.dateOfBirth !== null &&
      (() => {
        const dob = parseBirthDate(decision.dateOfBirth);
        return dob !== null && isOfAge(dob);
      })());

  if (!ofAge) return gateRedirect(request, next, "id_underage");

  if (record.userId) {
    await db.user
      .update({ where: { id: record.userId }, data: { idVerified: true } })
      .catch(() => {});
  }

  const url = request.nextUrl.clone();
  url.pathname = next.split("?")[0];
  url.search = next.includes("?") ? next.slice(next.indexOf("?")) : "";
  const response = NextResponse.redirect(url);
  response.cookies.set("budtube_age_ok", "1", {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  return response;
}
