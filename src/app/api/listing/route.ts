import { NextResponse } from "next/server";
import { errorResponse, noStoreHeaders } from "@/lib/api";
import { ensureRootExists } from "@/lib/fs/gallery";
import { buildListing } from "@/lib/listing";
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

    const listing = await buildListing(token, key, dir);
    return NextResponse.json(listing, { headers: noStoreHeaders() });
  } catch (error) {
    return errorResponse(error);
  }
}
