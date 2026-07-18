"use server";

import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";

export type SettingsState = { error?: string; success?: string } | undefined;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function updateProfile(
  _prevState: SettingsState,
  formData: FormData
): Promise<SettingsState> {
  const session = await getSession();
  if (!session) return { error: "Not signed in." };

  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const bio = String(formData.get("bio") ?? "").trim();

  if (!EMAIL_RE.test(email)) return { error: "Enter a valid email address." };
  if (bio.length > 300) return { error: "Bio is too long (max 300 characters)." };

  const taken = await db.user.findFirst({
    where: { email, id: { not: session.userId } },
    select: { id: true },
  });
  if (taken) return { error: "That email is already in use." };

  await db.user.update({
    where: { id: session.userId },
    data: { email, bio: bio || null },
  });

  revalidatePath("/settings");
  revalidatePath(`/channel/${session.username}`);
  return { success: "Profile updated." };
}

export async function changePassword(
  _prevState: SettingsState,
  formData: FormData
): Promise<SettingsState> {
  const session = await getSession();
  if (!session) return { error: "Not signed in." };

  const currentPassword = String(formData.get("currentPassword") ?? "");
  const newPassword = String(formData.get("newPassword") ?? "");
  const confirmPassword = String(formData.get("confirmPassword") ?? "");

  if (newPassword.length < 8) {
    return { error: "New password must be at least 8 characters." };
  }
  if (newPassword !== confirmPassword) {
    return { error: "New passwords don't match." };
  }

  const user = await db.user.findUnique({ where: { id: session.userId } });
  if (!user || !(await bcrypt.compare(currentPassword, user.passwordHash))) {
    return { error: "Current password is incorrect." };
  }

  await db.user.update({
    where: { id: session.userId },
    data: { passwordHash: await bcrypt.hash(newPassword, 10) },
  });

  return { success: "Password changed." };
}
