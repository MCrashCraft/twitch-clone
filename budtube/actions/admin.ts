"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { isOwner } from "@/lib/roles";

/** Owner-only: toggle a user between USER and ADMIN. OWNER is untouchable. */
export async function setUserRole(userId: string, makeAdmin: boolean) {
  const session = await getSession();
  if (!session) return { error: "Not signed in." };

  const requester = await db.user.findUnique({
    where: { id: session.userId },
    select: { role: true },
  });
  if (!isOwner(requester?.role)) {
    return { error: "Only the site owner can manage roles." };
  }

  const target = await db.user.findUnique({
    where: { id: userId },
    select: { role: true },
  });
  if (!target) return { error: "User not found." };
  if (target.role === "OWNER") {
    return { error: "The owner account can't be changed." };
  }

  await db.user.update({
    where: { id: userId },
    data: { role: makeAdmin ? "ADMIN" : "USER" },
  });

  revalidatePath("/admin");
  return {};
}
