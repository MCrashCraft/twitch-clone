import path from "path";
import fs from "fs/promises";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { isCategory } from "@/lib/categories";
import {
  UPLOAD_DIR,
  VIDEO_TYPES,
  IMAGE_TYPES,
  MAX_VIDEO_BYTES,
  MAX_IMAGE_BYTES,
  ensureDirs,
} from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function bad(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) return bad("Sign in to upload.", 401);

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return bad("Expected multipart form data.");
  }

  const title = String(form.get("title") ?? "").trim();
  const description = String(form.get("description") ?? "").trim();
  const category = String(form.get("category") ?? "");
  const video = form.get("video");
  const thumbnail = form.get("thumbnail");

  if (title.length < 1 || title.length > 120) {
    return bad("Title must be 1-120 characters.");
  }
  if (description.length > 5000) {
    return bad("Description is too long (max 5000 characters).");
  }
  if (!isCategory(category)) {
    return bad("Pick a valid category.");
  }
  if (!(video instanceof File) || video.size === 0) {
    return bad("Attach a video file.");
  }
  const videoExt = VIDEO_TYPES[video.type];
  if (!videoExt) {
    return bad("Video must be MP4, WebM, or Ogg.");
  }
  if (video.size > MAX_VIDEO_BYTES) {
    return bad("Video is too large (max 500 MB).");
  }

  const hasThumb = thumbnail instanceof File && thumbnail.size > 0;
  let thumbExt: string | undefined;
  if (hasThumb) {
    thumbExt = IMAGE_TYPES[(thumbnail as File).type];
    if (!thumbExt) return bad("Thumbnail must be JPEG, PNG, or WebP.");
    if ((thumbnail as File).size > MAX_IMAGE_BYTES) {
      return bad("Thumbnail is too large (max 5 MB).");
    }
  }

  await ensureDirs();

  // Create the row first so files are named by the video's id.
  const record = await db.video.create({
    data: {
      title,
      description,
      category,
      mimeType: video.type,
      userId: session.userId,
    },
  });

  const filePath = `videos/${record.id}${videoExt}`;
  const thumbnailPath = hasThumb
    ? `thumbnails/${record.id}${thumbExt}`
    : null;

  try {
    // Demo-scale simplification: buffers the whole file in memory.
    await fs.writeFile(
      path.join(UPLOAD_DIR, filePath),
      Buffer.from(await video.arrayBuffer())
    );
    if (hasThumb && thumbnailPath) {
      await fs.writeFile(
        path.join(UPLOAD_DIR, thumbnailPath),
        Buffer.from(await (thumbnail as File).arrayBuffer())
      );
    }
    await db.video.update({
      where: { id: record.id },
      data: { filePath, thumbnailPath },
    });
  } catch (error) {
    await db.video.delete({ where: { id: record.id } }).catch(() => {});
    await fs.unlink(path.join(UPLOAD_DIR, filePath)).catch(() => {});
    if (thumbnailPath) {
      await fs.unlink(path.join(UPLOAD_DIR, thumbnailPath)).catch(() => {});
    }
    console.error("Upload failed:", error);
    return bad("Failed to save the upload. Try again.", 500);
  }

  return NextResponse.json({ videoId: record.id });
}
