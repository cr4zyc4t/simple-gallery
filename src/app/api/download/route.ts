import fs from "node:fs";
import { errorResponse } from "@/lib/api";
import { PathError, resolveToken } from "@/lib/fs/safe-path";
import { baseName, fileResponse } from "@/lib/http-file";
import { mimeFor } from "@/lib/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Download endpoint. Only single files are accepted — folders are deliberately
 * not downloadable.
 */
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const target = resolveToken(url.searchParams.get("path"));
    const stats = fs.statSync(target);
    if (stats.isDirectory()) {
      throw new PathError("Folders cannot be downloaded — open one instead", 400);
    }
    return fileResponse(request, target, {
      mime: mimeFor(target),
      downloadName: baseName(target),
      maxAge: 0,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
