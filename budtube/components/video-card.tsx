import Link from "next/link";
import { formatViews, timeAgo } from "@/lib/format";

export type VideoCardData = {
  id: string;
  title: string;
  category: string;
  views: number;
  createdAt: Date;
  user: { username: string };
};

export function VideoCard({ video }: { video: VideoCardData }) {
  return (
    <div className="group">
      <Link href={`/watch/${video.id}`} className="block">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={`/api/thumbnails/${video.id}`}
          alt={video.title}
          className="aspect-video w-full rounded-xl border border-bud-border object-cover transition group-hover:border-bud-primary"
          loading="lazy"
        />
      </Link>
      <div className="mt-2 flex gap-3">
        <Link
          href={`/channel/${video.user.username}`}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-bud-raised text-sm font-bold text-bud-primary"
        >
          {video.user.username[0]?.toUpperCase()}
        </Link>
        <div className="min-w-0">
          <Link href={`/watch/${video.id}`}>
            <h3 className="line-clamp-2 text-sm font-semibold leading-snug group-hover:text-bud-primary">
              {video.title}
            </h3>
          </Link>
          <Link
            href={`/channel/${video.user.username}`}
            className="mt-0.5 block text-xs text-bud-muted hover:text-zinc-300"
          >
            @{video.user.username}
          </Link>
          <p className="text-xs text-bud-muted">
            {formatViews(video.views)} · {timeAgo(video.createdAt)}
          </p>
        </div>
      </div>
    </div>
  );
}
