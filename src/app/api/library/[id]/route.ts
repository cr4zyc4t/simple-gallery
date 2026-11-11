import { NextResponse } from "next/server";
import { errorResponse, noStoreHeaders } from "@/lib/api";
import { PathError } from "@/lib/fs/safe-path";
import { getDb } from "@/lib/db";
import { folders } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { removeFolderById } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Remove a folder from the library. Files on disk are untouched. */
export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const numericId = Number(id);
    if (!Number.isInteger(numericId) || numericId <= 0) throw new PathError("Invalid folder id");

    const db = getDb();
    const [row] = db.select().from(folders).where(eq(folders.id, numericId)).all();
    if (!row) throw new PathError("Folder is not in the library", 404);
    if (row.isDefault) throw new PathError("The default gallery folder cannot be removed", 400);

    removeFolderById(numericId);
    return NextResponse.json({ removed: true, id: numericId }, { headers: noStoreHeaders() });
  } catch (error) {
    return errorResponse(error);
  }
}
