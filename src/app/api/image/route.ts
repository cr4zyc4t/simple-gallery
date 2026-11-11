import fs from "node:fs";
import { errorResponse } from "@/lib/api";
import { PathError, resolveToken } from "@/lib/fs/safe-path";
import { mimeFor } from "@/lib/config";
import { fileResponse } from "@/lib/http-file";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Full resolution preview for the carousel (supports Range requests). */
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const target = resolveToken(url.searchParams.get("path"));
    const stats = fs.statSync(target);
    if (stats.isDirectory()) throw new PathError("Cannot preview a folder", 400);
    return fileResponse(request, target, { mime: mimeFor(target), maxAge: 0 });
  } catch (error) {
    return errorResponse(error);
  }
}
