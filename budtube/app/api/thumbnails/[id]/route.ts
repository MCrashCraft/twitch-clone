import { readFile } from "fs/promises";
import path from "path";
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { safeUploadPath } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CONTENT_TYPES: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
};

// Serve the placeholder inline rather than redirecting: a redirect built
// from request.url points at the backend origin (e.g. localhost:3420),
// which is unreachable when the app sits behind a reverse proxy.
async function placeholder() {
  const data = await readFile(
    path.join(process.cwd(), "public", "placeholder-thumb.svg")
  );
  return new Response(new Uint8Array(data), {
    headers: {
      "Content-Type": "image/svg+xml",
      "Cache-Control": "public, max-age=3600",
    },
  });
}

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const video = await db.video.findUnique({
    where: { id: params.id },
    select: { thumbnailPath: true },
  });

  if (!video?.thumbnailPath) return placeholder();

  try {
    const absolutePath = safeUploadPath(video.thumbnailPath);
    const data = await readFile(absolutePath);
    const contentType =
      CONTENT_TYPES[path.extname(absolutePath)] ?? "application/octet-stream";
    return new Response(new Uint8Array(data), {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch {
    return placeholder();
  }
}
