import { VideoCard, type VideoCardData } from "@/components/video-card";

export function VideoGrid({
  videos,
  emptyMessage = "No videos yet. Be the first to upload!",
}: {
  videos: VideoCardData[];
  emptyMessage?: string;
}) {
  if (videos.length === 0) {
    return (
      <div className="card flex flex-col items-center gap-2 p-12 text-center">
        <span className="text-3xl" aria-hidden>
          🌿
        </span>
        <p className="text-bud-muted">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-x-4 gap-y-6 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
      {videos.map((video) => (
        <VideoCard key={video.id} video={video} />
      ))}
    </div>
  );
}
