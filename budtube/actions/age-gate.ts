"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { parseBirthDate, isOfAge, MIN_AGE } from "@/lib/age";

export type AgeGateState = { error: string } | undefined;

export async function confirmAge(
  _prevState: AgeGateState,
  formData: FormData
): Promise<AgeGateState> {
  const nextRaw = formData.get("next");
  const next =
    typeof nextRaw === "string" && nextRaw.startsWith("/") && !nextRaw.startsWith("//")
      ? nextRaw
      : "/";

  const birthDate = parseBirthDate(String(formData.get("dob") ?? ""));
  if (!birthDate) {
    return { error: "Enter your date of birth." };
  }
  if (!isOfAge(birthDate)) {
    return {
      error: `Sorry — you must be ${MIN_AGE} or older to enter BudTube.`,
    };
  }

  cookies().set("budtube_age_ok", "1", {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });

  redirect(next);
}
