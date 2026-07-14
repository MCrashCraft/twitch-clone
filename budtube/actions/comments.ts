"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";

export async function addComment(videoId: string, formData: FormData) {
  const session = await getSession();
  if (!session) return { error: "Sign in to comment." };

  const content = String(formData.get("content") ?? "").trim();
  if (!content) return { error: "Comment can't be empty." };
  if (content.length > 1000) return { error: "Comment is too long (max 1000 characters)." };

  const video = await db.video.findUnique({
    where: { id: videoId },
    select: { id: true },
  });
  if (!video) return { error: "Video not found." };

  await db.comment.create({
    data: { content, userId: session.userId, videoId },
  });

  revalidatePath(`/watch/${videoId}`);
  return {};
}
