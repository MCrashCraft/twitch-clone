import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { formatCount } from "@/lib/format";
import { SubscribeButton } from "@/components/subscribe-button";
import { VideoGrid } from "@/components/video-grid";

export async function generateMetadata({
  params,
}: {
  params: { username: string };
}): Promise<Metadata> {
  return { title: `@${params.username}` };
}

export default async function ChannelPage({
  params,
}: {
  params: { username: string };
}) {
  const session = await getSession();

  const channel = await db.user.findUnique({
    where: { username: params.username.toLowerCase() },
    include: {
      videos: {
        where: { published: true, filePath: { not: "" } },
        orderBy: { createdAt: "desc" },
        include: { user: { select: { username: true } } },
      },
      _count: { select: { subscribers: true } },
    },
  });

  if (!channel) notFound();

  const subscribed = session
    ? Boolean(
        await db.subscription.findUnique({
          where: {
            subscriberId_channelId: {
              subscriberId: session.userId,
              channelId: channel.id,
            },
          },
        })
      )
    : false;

  const isOwnChannel = session?.userId === channel.id;

  return (
    <div>
      <div className="h-32 rounded-xl bg-gradient-to-r from-bud-primaryDark via-bud-raised to-bud-accent/40 sm:h-40" />

      <div className="mt-[-2rem] flex flex-wrap items-end gap-4 px-4">
        <div className="flex h-24 w-24 items-center justify-center rounded-full border-4 border-bud-bg bg-bud-raised text-3xl font-bold text-bud-primary">
          {channel.username[0]?.toUpperCase()}
        </div>
        <div className="flex-1 pb-1">
          <h1 className="text-2xl font-bold">@{channel.username}</h1>
          <p className="text-sm text-bud-muted">
            {formatCount(channel._count.subscribers)} subscriber
            {channel._count.subscribers === 1 ? "" : "s"} ·{" "}
            {channel.videos.length} video
            {channel.videos.length === 1 ? "" : "s"}
          </p>
          {channel.bio && (
            <p className="mt-1 max-w-xl text-sm text-zinc-300">{channel.bio}</p>
          )}
        </div>
        {!isOwnChannel && (
          <div className="pb-2">
            <SubscribeButton
              channelId={channel.id}
              initialSubscribed={subscribed}
              signedIn={!!session}
            />
          </div>
        )}
      </div>

      <div className="mt-8">
        <VideoGrid
          videos={channel.videos}
          emptyMessage={`@${channel.username} hasn't uploaded anything yet.`}
        />
      </div>
    </div>
  );
}
