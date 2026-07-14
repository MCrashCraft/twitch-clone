import type { Metadata } from "next";
import { db } from "@/lib/db";
import { VideoGrid } from "@/components/video-grid";

export const metadata: Metadata = { title: "Search" };
export const dynamic = "force-dynamic";

export default async function SearchPage({
  searchParams,
}: {
  searchParams: { q?: string };
}) {
  const query = (searchParams.q ?? "").trim();

  // SQLite LIKE (Prisma `contains`) is case-insensitive for ASCII.
  const videos = query
    ? await db.video.findMany({
        where: {
          published: true,
          filePath: { not: "" },
          OR: [
            { title: { contains: query } },
            { description: { contains: query } },
          ],
        },
        orderBy: { createdAt: "desc" },
        take: 24,
        include: { user: { select: { username: true } } },
      })
    : [];

  return (
    <div>
      <h1 className="mb-4 text-xl font-bold">
        {query ? (
          <>
            Results for <span className="text-bud-primary">“{query}”</span>
          </>
        ) : (
          "Search"
        )}
      </h1>
      {query ? (
        <VideoGrid
          videos={videos}
          emptyMessage={`Nothing found for “${query}”. Try another search.`}
        />
      ) : (
        <p className="text-bud-muted">
          Type something in the search box up top.
        </p>
      )}
    </div>
  );
}
