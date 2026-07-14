import path from "path";
import fs from "fs/promises";

export const UPLOAD_DIR = path.join(process.cwd(), "uploads");

export const VIDEO_TYPES: Record<string, string> = {
  "video/mp4": ".mp4",
  "video/webm": ".webm",
  "video/ogg": ".ogv",
};

export const IMAGE_TYPES: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
};

export const MAX_VIDEO_BYTES = 500 * 1024 * 1024; // 500 MB
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5 MB

export async function ensureDirs() {
  await fs.mkdir(path.join(UPLOAD_DIR, "videos"), { recursive: true });
  await fs.mkdir(path.join(UPLOAD_DIR, "thumbnails"), { recursive: true });
}

/**
 * Resolve a DB-stored relative path against UPLOAD_DIR, refusing anything
 * that escapes it (the value round-trips through the database).
 */
export function safeUploadPath(relativePath: string): string {
  const resolved = path.resolve(UPLOAD_DIR, relativePath);
  if (resolved !== UPLOAD_DIR && !resolved.startsWith(UPLOAD_DIR + path.sep)) {
    throw new Error("Invalid upload path");
  }
  return resolved;
}

export async function removeUploadedFile(relativePath: string) {
  try {
    await fs.unlink(safeUploadPath(relativePath));
  } catch {
    // best-effort cleanup
  }
}
