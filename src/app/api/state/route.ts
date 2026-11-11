import { NextResponse } from "next/server";
import { errorResponse, noStoreHeaders } from "@/lib/api";
import { GALLERY_ROOT, ALLOWED_ROOTS, READ_ONLY } from "@/lib/config";
import { ensureRootExists, folderInfo } from "@/lib/fs/gallery";
import { ensureDefaultFolder, findFolderByPath } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Startup info used by the client: default folder + capabilities. */
export async function GET() {
  try {
    ensureRootExists();
    ensureDefaultFolder();
    const info = folderInfo(GALLERY_ROOT, Boolean(findFolderByPath(GALLERY_ROOT)));
    return NextResponse.json(
      {
        folder: info,
        allowedRoots: ALLOWED_ROOTS,
        readOnly: READ_ONLY,
        canDelete: !READ_ONLY,
      },
      { headers: noStoreHeaders() },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
