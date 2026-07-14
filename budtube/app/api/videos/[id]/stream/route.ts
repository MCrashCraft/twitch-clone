import fs from "fs";
import { stat } from "fs/promises";
import { Readable } from "stream";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { safeUploadPath } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function streamBody(
  absolutePath: string,
  range?: { start: number; end: number }
): ReadableStream {
  const nodeStream = fs.createReadStream(absolutePath, range);
  return Readable.toWeb(nodeStream) as ReadableStream;
}

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const video = await db.video.findUnique({ where: { id: params.id } });
  if (!video || !video.published || !video.filePath) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  let absolutePath: string;
  let size: number;
  try {
    absolutePath = safeUploadPath(video.filePath);
    size = (await stat(absolutePath)).size;
  } catch {
    return NextResponse.json({ error: "File missing" }, { status: 404 });
  }

  const rangeHeader = request.headers.get("range");

  if (!rangeHeader) {
    return new Response(streamBody(absolutePath), {
      status: 200,
      headers: {
        "Content-Type": video.mimeType,
        "Content-Length": String(size),
        "Accept-Ranges": "bytes",
      },
    });
  }

  const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader.trim());
  let start: number;
  let end: number;

  if (match && (match[1] || match[2])) {
    if (match[1]) {
      start = parseInt(match[1], 10);
      end = match[2] ? Math.min(parseInt(match[2], 10), size - 1) : size - 1;
    } else {
      // Suffix range: bytes=-N (last N bytes)
      const suffixLength = Math.min(parseInt(match[2], 10), size);
      start = size - suffixLength;
      end = size - 1;
    }
  } else {
    start = NaN;
    end = NaN;
  }

  if (!Number.isFinite(start) || !Number.isFinite(end) || start >= size || start > end) {
    return new Response(null, {
      status: 416,
      headers: { "Content-Range": `bytes */${size}` },
    });
  }

  return new Response(streamBody(absolutePath, { start, end }), {
    status: 206,
    headers: {
      "Content-Type": video.mimeType,
      "Content-Length": String(end - start + 1),
      "Content-Range": `bytes ${start}-${end}/${size}`,
      "Accept-Ranges": "bytes",
    },
  });
}
