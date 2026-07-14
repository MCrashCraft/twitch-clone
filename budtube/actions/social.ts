"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";

export async function toggleLike(videoId: string) {
  const session = await getSession();
  if (!session) return { error: "Sign in to like videos." };

  const video = await db.video.findUnique({
    where: { id: videoId },
    select: { id: true },
  });
  if (!video) return { error: "Video not found." };

  const existing = await db.videoLike.findUnique({
    where: { userId_videoId: { userId: session.userId, videoId } },
  });

  if (existing) {
    await db.videoLike.delete({ where: { id: existing.id } });
  } else {
    await db.videoLike.create({
      data: { userId: session.userId, videoId },
    });
  }

  revalidatePath(`/watch/${videoId}`);
  return { liked: !existing };
}

export async function toggleSubscribe(channelId: string) {
  const session = await getSession();
  if (!session) return { error: "Sign in to subscribe." };
  if (channelId === session.userId) {
    return { error: "You can't subscribe to yourself." };
  }

  const channel = await db.user.findUnique({
    where: { id: channelId },
    select: { username: true },
  });
  if (!channel) return { error: "Channel not found." };

  const existing = await db.subscription.findUnique({
    where: {
      subscriberId_channelId: { subscriberId: session.userId, channelId },
    },
  });

  if (existing) {
    await db.subscription.delete({ where: { id: existing.id } });
  } else {
    await db.subscription.create({
      data: { subscriberId: session.userId, channelId },
    });
  }

  revalidatePath(`/channel/${channel.username}`);
  return { subscribed: !existing };
}
