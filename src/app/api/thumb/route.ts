import fs from "node:fs";
import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/api";
import { PathError, resolveToken } from "@/lib/fs/safe-path";
import { getThumbnail } from "@/lib/thumbs";
import { mimeFor } from "@/lib/config";
import { fileResponse } from "@/lib/http-file";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Resized, disk-cached thumbnail used by the grid/list. Falls back to the file. */
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const target = resolveToken(url.searchParams.get("path"));
    const stats = fs.statSync(target);
    if (stats.isDirectory()) throw new PathError("Cannot thumbnail a folder", 400);

    const width = Number.parseInt(url.searchParams.get("w") ?? "256", 10);
    const thumb = await getThumbnail(target, stats, width);

    if (thumb.passthrough) {
      return fileResponse(request, target, { mime: mimeFor(target), maxAge: 120 });
    }

    const etag = `W/"thumb-${Math.round(stats.mtimeMs).toString(16)}-${stats.size}-${width}"`;
    if (request.headers.get("if-none-match") === etag) {
      return new NextResponse(null, {
        status: 304,
        headers: { ETag: etag, "Cache-Control": "private, max-age=604800, immutable" },
      });
    }

    return new NextResponse(new Uint8Array(thumb.data), {
      headers: {
        "Content-Type": thumb.mime,
        "Content-Length": String(thumb.data.byteLength),
        "Cache-Control": "private, max-age=604800, immutable",
        ETag: etag,
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
