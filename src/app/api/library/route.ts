import { NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { errorResponse, noStoreHeaders, readJsonBody } from "@/lib/api";
import { GALLERY_ROOT } from "@/lib/config";
import { PathError, assertInsideAllowedRoots, realPathStrict, toToken } from "@/lib/fs/safe-path";
import { addFolder, ensureDefaultFolder, findFolderByPath, listFolders } from "@/lib/db";
import { toLibraryFolder, normalizeTypedPath } from "@/lib/library";
import { ensureRootExists } from "@/lib/fs/gallery";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Folders the user added to the library (browsed or typed). */
export async function GET() {
  try {
    ensureRootExists();
    ensureDefaultFolder();
    const folders = listFolders().map(toLibraryFolder);
    return NextResponse.json({ folders }, { headers: noStoreHeaders() });
  } catch (error) {
    return errorResponse(error);
  }
}

interface AddFolderBody {
  path?: string;
  token?: string;
  name?: string;
}

/**
 * Add a folder to the library. Accepts either a `token` coming from the browse
 * dialog or a raw `path` typed by the user. The target must exist, be a
 * directory and live inside an allowed root.
 */
export async function POST(request: Request) {
  try {
    const body = await readJsonBody<AddFolderBody>(request);
    let candidate: string;
    if (typeof body.token === "string" && body.token.length > 0) {
      candidate = Buffer.from(body.token, "base64url").toString("utf8");
    } else if (typeof body.path === "string" && body.path.trim().length > 0) {
      candidate = normalizeTypedPath(body.path, GALLERY_ROOT);
    } else {
      throw new PathError("Provide a folder path");
    }

    const target = realPathStrict(candidate);
    assertInsideAllowedRoots(target);

    if (!fs.statSync(target).isDirectory()) throw new PathError("Not a folder");

    const alreadyThere = findFolderByPath(target);
    const row =
      alreadyThere ??
      addFolder({
        name: ((body.name ?? "").trim() || path.basename(target) || target).trim() || target,
        path: target,
        parentPath: path.dirname(target),
      });

    return NextResponse.json(
      { folder: toLibraryFolder(row), token: toToken(target), created: !alreadyThere },
      { status: alreadyThere ? 200 : 201, headers: noStoreHeaders() },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
