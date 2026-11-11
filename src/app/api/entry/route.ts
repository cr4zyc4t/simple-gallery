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
  /** Single item (kept for simple callers). */
  path?: string;
  /** Batch mode: every item is attempted, each outcome is reported. */
  paths?: string[];
  kind?: EntryKind;
}

interface DeleteItemResult {
  token: string;
  ok: boolean;
  kind?: EntryKind;
  /** The item lived inside another selected folder and went with it. */
  removedWithParent?: boolean;
  removedLibraryEntries?: number;
  error?: string;
  status?: number;
}

const MAX_BATCH = 500;

/**
 * Delete pictures and folders (with their contents), one at a time or in bulk.
 * The UI always asks for confirmation; the server keeps its own guard rails
 * (allowed roots, never the gallery root) and applies them per item.
 */
export async function DELETE(request: Request) {
  try {
    assertWritable();
    const body = await readJsonBody<DeleteBody>(request);
    const tokens = Array.isArray(body.paths)
      ? body.paths.filter((token): token is string => typeof token === "string" && token.length > 0)
      : typeof body.path === "string" && body.path.length > 0
        ? [body.path]
        : [];
    if (tokens.length === 0) throw new PathError("Missing path token");
    if (tokens.length > MAX_BATCH) {
      throw new PathError(`Too many items at once (${MAX_BATCH} maximum)`, 413);
    }

    // Resolve and validate every token before touching the disk, so a token
    // pointing outside the allowed roots rejects the whole request.
    const resolved = tokens.map((token) => [resolveTokenLoose(token), token] as const);
    const unique = new Map<string, string>(resolved);

    // Shortest path first: a selected folder is removed before its own
    // children, which are then reported as removed with it instead of failing.
    const ordered = [...unique.entries()].sort((a, b) => a[0].length - b[0].length);
    const removedDirs: string[] = [];
    const results: DeleteItemResult[] = [];

    for (const [target, token] of ordered) {
      if (removedDirs.some((dir) => target.startsWith(`${dir}${path.sep}`))) {
        results.push({ token, ok: true, removedWithParent: true });
        continue;
      }
      try {
        const stats = fs.statSync(target);
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
          removedDirs.push(target);
          results.push({ token, ok: true, kind: "folder", removedLibraryEntries: removedLibraryRows });
        } else {
          if (body.kind && body.kind !== "image") throw new PathError("Path is an image", 400);
          try {
            await deleteImageFile(target);
          } catch (deleteError) {
            throw fileSystemError(deleteError);
          }
          purgeCacheFor(target);
          results.push({ token, ok: true, kind: "image" });
        }
      } catch (itemError) {
        const mapped = fileSystemError(itemError);
        results.push({
          token,
          ok: false,
          error: mapped instanceof Error ? mapped.message : "Delete failed",
          status: mapped instanceof PathError ? mapped.status : 500,
        });
      }
    }

    const deletedCount = results.filter((item) => item.ok).length;
    const failedCount = results.length - deletedCount;
    const removedLibraryEntries = results.reduce((sum, item) => sum + (item.removedLibraryEntries ?? 0), 0);

    // Nothing succeeded: surface the first reason as a normal error response.
    if (deletedCount === 0) {
      const first = results.find((item) => !item.ok) ?? { error: "Item no longer exists", status: 404 };
      return NextResponse.json(
        { error: first.error ?? "Delete failed", results },
        { status: first.status ?? 500, headers: noStoreHeaders() },
      );
    }

    const only = results.length === 1 ? results[0] : null;
    return NextResponse.json(
      {
        deleted: true,
        kind: only?.kind ?? "batch",
        batch: results.length > 1,
        requested: results.length,
        deletedCount,
        failedCount,
        removedLibraryEntries,
        results,
      },
      { headers: noStoreHeaders() },
    );
  } catch (error) {
    return errorResponse(error);
  }
}

/** Turn OS errors from the delete into a message the UI can show. */
function fileSystemError(error: unknown): unknown {
  if (error instanceof PathError) return error;
  const code = (error as NodeJS.ErrnoException).code;
  if (error instanceof TypeError) return new PathError("Invalid path", 400);
  if (code === "EROFS") return new PathError("The volume is mounted read-only", 403);
  if (code === "EACCES" || code === "EPERM") {
    return new PathError("Permission denied by the server process", 403);
  }
  if (code === "ENOENT") return new PathError("Item no longer exists", 404);
  if (code === "ENOTEMPTY") return new PathError("The folder is not empty", 409);
  return error;
}
