import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { formatViews, formatCount, timeAgo } from "@/lib/format";
import { LikeButton } from "@/components/like-button";
import { SubscribeButton } from "@/components/subscribe-button";
import { CommentSection } from "@/components/comment-section";
import { DeleteVideoButton } from "@/components/delete-video-button";
import { isStaff } from "@/lib/roles";

export async function generateMetadata({
  params,
}: {
  params: { id: string };
}): Promise<Metadata> {
  const video = await db.video.findUnique({
    where: { id: params.id },
    select: { title: true },
  });
  return { title: video?.title ?? "Video not found" };
}

export default async function WatchPage({
  params,
}: {
  params: { id: string };
}) {
  const session = await getSession();

  const video = await db.video.findUnique({
    where: { id: params.id },
    include: {
      user: {
        select: {
          id: true,
          username: true,
          _count: { select: { subscribers: true } },
        },
      },
      comments: {
        orderBy: { createdAt: "desc" },
        include: { user: { select: { username: true } } },
      },
      _count: { select: { likes: true } },
    },
  });

  if (!video || !video.published || !video.filePath) notFound();

  // Simple view counting: +1 per page load, no dedupe (demo scale).
  await db.video.update({
    where: { id: video.id },
    data: { views: { increment: 1 } },
  });

  const viewer = session
    ? await db.user.findUnique({
        where: { id: session.userId },
        select: { role: true },
      })
    : null;

  const [liked, subscribed] = session
    ? await Promise.all([
        db.videoLike
          .findUnique({
            where: {
              userId_videoId: { userId: session.userId, videoId: video.id },
            },
          })
          .then(Boolean),
        db.subscription
          .findUnique({
            where: {
              subscriberId_channelId: {
                subscriberId: session.userId,
                channelId: video.user.id,
              },
            },
          })
          .then(Boolean),
      ])
    : [false, false];

  const related = await db.video.findMany({
    where: { published: true, id: { not: video.id }, category: video.category },
    orderBy: { createdAt: "desc" },
    take: 8,
    include: { user: { select: { username: true } } },
  });
  if (related.length < 8) {
    const fill = await db.video.findMany({
      where: {
        published: true,
        id: { notIn: [video.id, ...related.map((v) => v.id)] },
      },
      orderBy: { createdAt: "desc" },
      take: 8 - related.length,
      include: { user: { select: { username: true } } },
    });
    related.push(...fill);
  }

  const isOwnVideo = session?.userId === video.user.id;
  const canDelete = isOwnVideo || isStaff(viewer?.role);

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <div className="min-w-0">
        <video
          controls
          preload="metadata"
          poster={`/api/thumbnails/${video.id}`}
          src={`/api/videos/${video.id}/stream`}
          className="aspect-video w-full rounded-xl border border-bud-border bg-black"
        />

        <h1 className="mt-4 text-xl font-bold">{video.title}</h1>
        <p className="mt-1 text-sm text-bud-muted">
          {formatViews(video.views + 1)} · {timeAgo(video.createdAt)} ·{" "}
          <span className="text-bud-primary">{video.category}</span>
        </p>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-4 border-y border-bud-border py-3">
          <div className="flex items-center gap-3">
            <Link
              href={`/channel/${video.user.username}`}
              className="flex h-10 w-10 items-center justify-center rounded-full bg-bud-raised text-base font-bold text-bud-primary"
            >
              {video.user.username[0]?.toUpperCase()}
            </Link>
            <div>
              <Link
                href={`/channel/${video.user.username}`}
                className="font-semibold hover:text-bud-primary"
              >
                @{video.user.username}
              </Link>
              <p className="text-xs text-bud-muted">
                {formatCount(video.user._count.subscribers)} subscriber
                {video.user._count.subscribers === 1 ? "" : "s"}
              </p>
            </div>
            {!isOwnVideo && (
              <SubscribeButton
                channelId={video.user.id}
                initialSubscribed={subscribed}
                signedIn={!!session}
              />
            )}
          </div>
          <div className="flex items-center gap-2">
            <LikeButton
              videoId={video.id}
              initialLiked={liked}
              initialCount={video._count.likes}
              signedIn={!!session}
            />
            {canDelete && (
              <DeleteVideoButton videoId={video.id} redirectTo="/" />
            )}
          </div>
        </div>

        {video.description && (
          <p className="mt-4 whitespace-pre-wrap break-words rounded-xl bg-bud-surface p-4 text-sm text-zinc-200">
            {video.description}
          </p>
        )}

        <CommentSection
          videoId={video.id}
          signedIn={!!session}
          comments={video.comments.map((comment) => ({
            id: comment.id,
            content: comment.content,
            createdAt: comment.createdAt.toISOString(),
            username: comment.user.username,
          }))}
        />
      </div>

      <aside>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-bud-muted">
          More sesh 🌿
        </h2>
        <div className="space-y-3">
          {related.map((item) => (
            <Link
              key={item.id}
              href={`/watch/${item.id}`}
              className="group flex gap-2"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`/api/thumbnails/${item.id}`}
                alt={item.title}
                className="aspect-video w-40 shrink-0 rounded-lg border border-bud-border object-cover"
                loading="lazy"
              />
              <div className="min-w-0">
                <p className="line-clamp-2 text-sm font-medium leading-snug group-hover:text-bud-primary">
                  {item.title}
                </p>
                <p className="text-xs text-bud-muted">@{item.user.username}</p>
                <p className="text-xs text-bud-muted">
                  {formatViews(item.views)}
                </p>
              </div>
            </Link>
          ))}
          {related.length === 0 && (
            <p className="text-sm text-bud-muted">Nothing else here yet.</p>
          )}
        </div>
      </aside>
    </div>
  );
}
