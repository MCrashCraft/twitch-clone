"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { parseBirthDate, isOfAge, MIN_AGE } from "@/lib/age";
import { canUseDidit, createDiditSession } from "@/lib/didit";
import { getSession } from "@/lib/auth";

export type AgeGateState = { error: string } | undefined;

function safeNext(value: FormDataEntryValue | null): string {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//")) {
    return "/";
  }
  return value;
}

export async function grantAgeCookie() {
  cookies().set("budtube_age_ok", "1", {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
}

export async function confirmAge(
  _prevState: AgeGateState,
  formData: FormData
): Promise<AgeGateState> {
  const next = safeNext(formData.get("next"));

  const birthDate = parseBirthDate(String(formData.get("dob") ?? ""));
  if (!birthDate) {
    return { error: "Enter your date of birth." };
  }
  if (!isOfAge(birthDate)) {
    return {
      error: `Sorry — you must be ${MIN_AGE} or older to enter BudTube.`,
    };
  }

  await grantAgeCookie();
  redirect(next);
}

/** Kick off a Didit hosted ID-verification session and send the user there. */
export async function startIdVerification(formData: FormData) {
  const next = safeNext(formData.get("next"));

  if (!(await canUseDidit())) {
    // Unconfigured or monthly API cap reached — fall back to the DOB form.
    redirect(`/age-gate?next=${encodeURIComponent(next)}&error=id_unavailable`);
  }

  const h = headers();
  const proto = h.get("x-forwarded-proto") ?? "http";
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3420";
  const callbackUrl = `${proto}://${host}/age-gate/callback?next=${encodeURIComponent(next)}`;

  const session = await getSession();

  let verificationUrl: string;
  try {
    const created = await createDiditSession({
      callbackUrl,
      userId: session?.userId,
    });
    verificationUrl = created.url;
  } catch (error) {
    console.error("Didit session creation failed:", error);
    redirect(`/age-gate?next=${encodeURIComponent(next)}&error=id_failed`);
  }

  redirect(verificationUrl);
}
