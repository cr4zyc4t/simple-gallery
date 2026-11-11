import { NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { assertWritable, errorResponse, noStoreHeaders, readJsonBody } from "@/lib/api";
import { PathError, resolveToken, resolveTokenLoose } from "@/lib/fs/safe-path";
import { countChildren, deleteFolderTree, deleteImageFile } from "@/lib/fs/gallery";
import { mimeFor, isImageFile } from "@/lib/config";
import { removeFoldersUnder } from "@/lib/db";
import { purgeCacheFor } from "@/lib/thumbs";
import type { EntryKind } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Metadata for one entry — used to decide whether a folder needs confirming. */
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const token = url.searchParams.get("path");
    const target = resolveToken(token);
    const stats = fs.statSync(target);

    if (stats.isDirectory()) {
      const counts = await countChildren(target);
      return NextResponse.json(
        {
          kind: "folder" as EntryKind,
          name: path.basename(target) || target,
          modifiedAt: stats.mtimeMs,
          counts,
          empty: counts.folders + counts.images + counts.other === 0,
        },
        { headers: noStoreHeaders() },
      );
    }

    return NextResponse.json(
      {
        kind: "image" as EntryKind,
        name: path.basename(target),
        modifiedAt: stats.mtimeMs,
        sizeBytes: stats.size,
        mime: mimeFor(target),
        isImage: isImageFile(target),
      },
      { headers: noStoreHeaders() },
    );
  } catch (error) {
    return errorResponse(error);
  }
}

interface DeleteBody {
  path?: string;
  kind?: EntryKind;
}

/**
 * Delete a picture, or a folder with its contents.
 * The UI always asks for confirmation on a non-empty folder; the server keeps
 * its own guard rails (allowed roots, never the gallery root).
 */
export async function DELETE(request: Request) {
  try {
    assertWritable();
    const body = await readJsonBody<DeleteBody>(request);
    const target = resolveTokenLoose(body.path);
    let stats: fs.Stats;
    try {
      stats = fs.statSync(target);
    } catch {
      throw new PathError("Item no longer exists", 404);
    }

    if (stats.isDirectory()) {
      if (body.kind && body.kind !== "folder") {
        throw new PathError("Path is a folder, not an image", 400);
      }
      try {
        await deleteFolderTree(target);
      } catch (deleteError) {
        throw fileSystemError(deleteError);
      }
      const removedLibraryRows = removeFoldersUnder(target);
      purgeCacheFor(target);
      return NextResponse.json(
        { deleted: true, kind: "folder", removedLibraryEntries: removedLibraryRows },
        { headers: noStoreHeaders() },
      );
    }

    if (body.kind && body.kind !== "image") throw new PathError("Path is an image", 400);
    try {
      await deleteImageFile(target);
    } catch (deleteError) {
      throw fileSystemError(deleteError);
    }
    purgeCacheFor(target);
    return NextResponse.json({ deleted: true, kind: "image" }, { headers: noStoreHeaders() });
  } catch (error) {
    return errorResponse(error);
  }
}

/** Turn OS errors from the delete into a message the UI can show. */
function fileSystemError(error: unknown): unknown {
  if (error instanceof PathError) return error;
  const code = (error as NodeJS.ErrnoException).code;
  if (code === "EROFS") return new PathError("The volume is mounted read-only", 403);
  if (code === "EACCES" || code === "EPERM") {
    return new PathError("Permission denied by the server process", 403);
  }
  if (code === "ENOENT") return new PathError("Item no longer exists", 404);
  if (code === "ENOTEMPTY") return new PathError("The folder is not empty", 409);
  return error;
}
