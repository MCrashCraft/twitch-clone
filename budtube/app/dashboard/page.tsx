import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { formatViews, timeAgo } from "@/lib/format";
import { DeleteVideoButton } from "@/components/delete-video-button";

export const metadata: Metadata = { title: "Your videos" };
export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const session = await getSession();
  if (!session) redirect("/sign-in?next=/dashboard");

  const videos = await db.video.findMany({
    where: { userId: session.userId },
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { likes: true, comments: true } } },
  });

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Your videos</h1>
          <p className="text-sm text-bud-muted">
            Signed in as @{session.username}
          </p>
        </div>
        <Link href="/upload" className="btn-primary">
          Upload
        </Link>
      </div>

      {videos.length === 0 ? (
        <div className="card flex flex-col items-center gap-3 p-12 text-center">
          <span className="text-3xl" aria-hidden>
            📼
          </span>
          <p className="text-bud-muted">
            You haven&apos;t uploaded anything yet.
          </p>
          <Link href="/upload" className="btn-primary">
            Upload your first video
          </Link>
        </div>
      ) : (
        <ul className="card divide-y divide-bud-border">
          {videos.map((video) => (
            <li
              key={video.id}
              className="flex flex-wrap items-center gap-4 p-4"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`/api/thumbnails/${video.id}`}
                alt=""
                className="aspect-video w-32 shrink-0 rounded-lg border border-bud-border object-cover"
              />
              <div className="min-w-0 flex-1">
                <Link
                  href={`/watch/${video.id}`}
                  className="line-clamp-1 font-semibold hover:text-bud-primary"
                >
                  {video.title}
                </Link>
                <p className="text-xs text-bud-muted">
                  {video.category} · {timeAgo(video.createdAt)}
                </p>
                <p className="text-xs text-bud-muted">
                  {formatViews(video.views)} · {video._count.likes} like
                  {video._count.likes === 1 ? "" : "s"} ·{" "}
                  {video._count.comments} comment
                  {video._count.comments === 1 ? "" : "s"}
                </p>
              </div>
              <DeleteVideoButton videoId={video.id} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
