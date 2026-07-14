import { db } from "@/lib/db";
import { categoryBySlug } from "@/lib/categories";
import { CategoryPills } from "@/components/category-pills";
import { VideoGrid } from "@/components/video-grid";

export const dynamic = "force-dynamic";

export default async function HomePage({
  searchParams,
}: {
  searchParams: { category?: string };
}) {
  const activeCategory = searchParams.category
    ? categoryBySlug(searchParams.category)
    : undefined;

  const videos = await db.video.findMany({
    where: {
      published: true,
      filePath: { not: "" },
      ...(activeCategory ? { category: activeCategory.name } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 24,
    include: { user: { select: { username: true } } },
  });

  return (
    <div>
      <CategoryPills active={activeCategory?.slug} />
      <div className="mt-4">
        <VideoGrid
          videos={videos}
          emptyMessage={
            activeCategory
              ? `Nothing in ${activeCategory.name} yet. Got a clip? Upload it!`
              : "No videos yet. Be the first to upload!"
          }
        />
      </div>
    </div>
  );
}
