"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { removeUploadedFile } from "@/lib/storage";
import { isStaff } from "@/lib/roles";

export async function deleteVideo(videoId: string) {
  const session = await getSession();
  if (!session) return { error: "Not signed in." };

  const video = await db.video.findUnique({ where: { id: videoId } });
  if (!video) return { error: "Video not found." };

  // Owners can delete their own videos; staff (ADMIN/OWNER) can delete any.
  if (video.userId !== session.userId) {
    const requester = await db.user.findUnique({
      where: { id: session.userId },
      select: { role: true },
    });
    if (!isStaff(requester?.role)) {
      return { error: "You don't own this video." };
    }
  }

  if (video.filePath) await removeUploadedFile(video.filePath);
  if (video.thumbnailPath) await removeUploadedFile(video.thumbnailPath);

  await db.video.delete({ where: { id: videoId } });

  revalidatePath("/");
  revalidatePath("/dashboard");
  return {};
}
