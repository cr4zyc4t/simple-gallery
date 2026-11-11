import { NextResponse } from "next/server";
import fs from "node:fs";
import { errorResponse, noStoreHeaders } from "@/lib/api";
import { PathError, resolveToken } from "@/lib/fs/safe-path";
import { browseDir, buildBrowseResponse, ensureRootExists } from "@/lib/fs/gallery";
import { READ_ONLY } from "@/lib/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Directory browser used by the "Add folder" dialog.
 * Without a `path` token it returns the allowed roots; with one it returns the
 * sub-folders of that directory.
 */
export async function GET(request: Request) {
  try {
    ensureRootExists();
    const url = new URL(request.url);
    const token = url.searchParams.get("path");

    if (!token) {
      const base = buildBrowseResponse(null);
      return NextResponse.json(
        { ...base, entries: [], readOnly: READ_ONLY },
        { headers: noStoreHeaders() },
      );
    }

    const dir = resolveToken(token);
    if (!fs.statSync(dir).isDirectory()) throw new PathError("Not a folder", 400);
    const base = buildBrowseResponse(dir);
    const entries = await browseDir(dir);
    return NextResponse.json(
      { ...base, entries, readOnly: READ_ONLY },
      { headers: noStoreHeaders() },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
