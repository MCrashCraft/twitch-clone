// Didit identity verification (https://docs.didit.me).
// Free tier: 500 checks/month — DIDIT_MONTHLY_CAP (default 450) keeps us
// safely under it; past the cap the age gate falls back to the DOB form.
import { db } from "@/lib/db";

const DIDIT_BASE = "https://verification.didit.me/v3";

export function isDiditConfigured() {
  return Boolean(process.env.DIDIT_API_KEY && process.env.DIDIT_WORKFLOW_ID);
}

export function monthlyCap() {
  const cap = Number(process.env.DIDIT_MONTHLY_CAP ?? 450);
  return Number.isFinite(cap) && cap > 0 ? cap : 450;
}

function startOfCurrentMonthUTC() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

export async function monthlyUsage() {
  return db.verificationSession.count({
    where: { createdAt: { gte: startOfCurrentMonthUTC() } },
  });
}

/** True when Didit is configured AND we're under the monthly API cap. */
export async function canUseDidit() {
  if (!isDiditConfigured()) return false;
  return (await monthlyUsage()) < monthlyCap();
}

export async function createDiditSession({
  callbackUrl,
  userId,
}: {
  callbackUrl: string;
  userId?: string;
}): Promise<{ url: string; sessionId: string }> {
  const response = await fetch(`${DIDIT_BASE}/session/`, {
    method: "POST",
    headers: {
      "x-api-key": process.env.DIDIT_API_KEY!,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      workflow_id: process.env.DIDIT_WORKFLOW_ID,
      callback: callbackUrl,
      ...(userId ? { vendor_data: userId } : {}),
    }),
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Didit session create failed: ${response.status}`);
  }

  const data = (await response.json()) as { session_id: string; url: string };

  await db.verificationSession.create({
    data: { sessionId: data.session_id, userId: userId ?? null },
  });

  return { url: data.url, sessionId: data.session_id };
}

export type DiditDecision = {
  status: string;
  age: number | null;
  dateOfBirth: string | null;
};

export async function getDiditDecision(
  sessionId: string
): Promise<DiditDecision> {
  const response = await fetch(
    `${DIDIT_BASE}/session/${encodeURIComponent(sessionId)}/decision/`,
    {
      headers: { "x-api-key": process.env.DIDIT_API_KEY! },
      cache: "no-store",
    }
  );

  if (!response.ok) {
    throw new Error(`Didit decision fetch failed: ${response.status}`);
  }

  const data = (await response.json()) as {
    status: string;
    id_verifications?: Array<{
      age?: number;
      date_of_birth?: string;
    }>;
  };

  const idv = data.id_verifications?.[0];
  return {
    status: data.status,
    age: typeof idv?.age === "number" ? idv.age : null,
    dateOfBirth: idv?.date_of_birth ?? null,
  };
}
