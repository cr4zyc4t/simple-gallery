import fs from "node:fs";
import { GALLERY_ROOT, READ_ONLY } from "@/lib/config";
import { findFolderByPath } from "@/lib/db";
import { folderInfo, listGalleryDir } from "@/lib/fs/gallery";
import { PathError, resolveToken } from "@/lib/fs/safe-path";
import type { ListingResponse, SortDir, SortKey } from "@/lib/types";

/**
 * Build the listing payload for a folder token (`null` = gallery root). Shared by
 * `GET /api/listing` and the server-rendered first paint, so a deep link and a
 * client fetch describe the same folder the same way.
 *
 * Throws `PathError` for a token that escapes the allowed roots, is missing or is
 * not a directory.
 */
export async function buildListing(
  token: string | null,
  key: SortKey,
  dir: SortDir,
): Promise<ListingResponse> {
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

  return {
    folder: info,
    entries,
    counts: {
      folders: entries.filter((entry) => entry.kind === "folder").length,
      images: entries.filter((entry) => entry.kind === "image").length,
    },
    readOnly: READ_ONLY,
  };
}
