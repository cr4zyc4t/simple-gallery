import fs from "node:fs";
import { createReadStream } from "node:fs";
import { Readable } from "node:stream";
import path from "node:path";

/** Static-file response helper with Range + ETag support (video-free, simple). */

interface FileResponseOptions {
  mime: string;
  /** When set, the browser downloads instead of displaying. */
  downloadName?: string;
  maxAge?: number;
}

function etagFor(size: number, mtimeMs: number): string {
  return `W/"${size.toString(16)}-${Math.round(mtimeMs).toString(16)}"`;
}

function contentDisposition(name: string): string {
  const sanitized = name.replace(/[\r\n"]/g, "").trim() || "download";
  const ascii = sanitized.replace(/[^\x20-\x7e]/g, "_");
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(sanitized)}`;
}

export async function fileResponse(
  request: Request,
  absolutePath: string,
  options: FileResponseOptions,
): Promise<Response> {
  const stats = fs.statSync(absolutePath);
  const size = stats.size;
  const etag = etagFor(size, stats.mtimeMs);
  const maxAge = options.maxAge ?? 0;

  const baseHeaders: Record<string, string> = {
    "Content-Type": options.mime,
    "Accept-Ranges": "bytes",
    "Last-Modified": stats.mtime.toUTCString(),
    ETag: etag,
    "Cache-Control": maxAge > 0 ? `private, max-age=${maxAge}` : "private, no-cache",
  };
  if (options.downloadName) {
    baseHeaders["Content-Disposition"] = contentDisposition(options.downloadName);
  }

  const ifNoneMatch = request.headers.get("if-none-match");
  if (ifNoneMatch && ifNoneMatch === etag) {
    return new Response(null, { status: 304, headers: baseHeaders });
  }

  const rangeHeader = request.headers.get("range");
  const match = rangeHeader ? /^bytes=(\d*)-(\d*)$/.exec(rangeHeader.trim()) : null;

  if (match) {
    let start = match[1] ? Number.parseInt(match[1], 10) : 0;
    let end = match[2] ? Number.parseInt(match[2], 10) : size - 1;
    if (Number.isNaN(start)) start = 0;
    if (Number.isNaN(end)) end = size - 1;
    if (size === 0 || start >= size || start > end) {
      return new Response(null, {
        status: 416,
        headers: { ...baseHeaders, "Content-Range": `bytes */${size}` },
      });
    }
    end = Math.min(end, size - 1);
    const length = end - start + 1;
    const body = Readable.toWeb(createReadStream(absolutePath, { start, end })) as ReadableStream;
    return new Response(body, {
      status: 206,
      headers: {
        ...baseHeaders,
        "Content-Length": String(length),
        "Content-Range": `bytes ${start}-${end}/${size}`,
      },
    });
  }

  const body = Readable.toWeb(createReadStream(absolutePath)) as ReadableStream;
  return new Response(body, {
    status: 200,
    headers: { ...baseHeaders, "Content-Length": String(size) },
  });
}

export function baseName(absolutePath: string): string {
  return path.basename(absolutePath);
}
