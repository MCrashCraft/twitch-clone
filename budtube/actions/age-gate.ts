"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

export async function confirmAge(formData: FormData) {
  const nextRaw = formData.get("next");
  const next =
    typeof nextRaw === "string" && nextRaw.startsWith("/") && !nextRaw.startsWith("//")
      ? nextRaw
      : "/";

  cookies().set("budtube_age_ok", "1", {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });

  redirect(next);
}
