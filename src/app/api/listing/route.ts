import { NextResponse } from "next/server";
import fs from "node:fs";
import { errorResponse, noStoreHeaders } from "@/lib/api";
import { PathError, resolveToken } from "@/lib/fs/safe-path";
import { ensureRootExists, folderInfo, listGalleryDir } from "@/lib/fs/gallery";
import { GALLERY_ROOT, READ_ONLY } from "@/lib/config";
import { findFolderByPath } from "@/lib/db";
import type { SortDir, SortKey } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Listing screen payload: sub-folders first, then pictures of one folder.
 * No `path` token means the default gallery folder.
 */
export async function GET(request: Request) {
  try {
    ensureRootExists();
    const url = new URL(request.url);
    const token = url.searchParams.get("path");
    const key: SortKey = url.searchParams.get("sort") === "date" ? "date" : "name";
    const dir: SortDir = url.searchParams.get("dir") === "desc" ? "desc" : "asc";

    const folder = token ? resolveToken(token) : GALLERY_ROOT;
    let stats: fs.Stats;
    try {
      stats = fs.statSync(folder);
    } catch {
      throw new PathError("Folder not found", 404);
    }
    if (!stats.isDirectory()) throw new PathError("Not a folder", 400);

    const entries = await listGalleryDir(folder, { key, dir });
    const info = folderInfo(folder, Boolean(findFolderByPath(folder)));
    const counts = {
      folders: entries.filter((entry) => entry.kind === "folder").length,
      images: entries.filter((entry) => entry.kind === "image").length,
    };

    return NextResponse.json(
      { folder: info, entries, counts, readOnly: READ_ONLY },
      { headers: noStoreHeaders() },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
