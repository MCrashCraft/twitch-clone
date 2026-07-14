import { readFile } from "fs/promises";
import path from "path";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { safeUploadPath } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CONTENT_TYPES: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
};

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const video = await db.video.findUnique({
    where: { id: params.id },
    select: { thumbnailPath: true },
  });

  if (!video?.thumbnailPath) {
    return NextResponse.redirect(
      new URL("/placeholder-thumb.svg", request.url)
    );
  }

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
    return NextResponse.redirect(
      new URL("/placeholder-thumb.svg", request.url)
    );
  }
}
