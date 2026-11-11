import fs from "node:fs";
import path from "node:path";
import { toToken } from "@/lib/fs/safe-path";
import type { FolderRow } from "@/lib/db/schema";
import type { LibraryFolder } from "@/lib/types";

export function toLibraryFolder(row: FolderRow): LibraryFolder {
  let exists = false;
  try {
    exists = fs.statSync(row.path).isDirectory();
  } catch {
    exists = false;
  }
  return {
    id: row.id,
    name: row.name,
    token: toToken(row.path),
    isDefault: row.isDefault,
    createdAt: row.createdAt instanceof Date ? row.createdAt.getTime() : Number(row.createdAt),
    exists,
  };
}

/**
 * Normalise a user-typed path: relative paths resolve against the gallery root,
 * `~` is not expanded (server side home is meaningless to the user), and the
 * result is collapsed so `a/../b` cannot hop out of an allowed root.
 */
export function normalizeTypedPath(input: string, root: string): string {
  const trimmed = input.trim().replace(/^["']+|["']+$/g, "");
  if (!trimmed) throw new Error("Enter a folder path");
  const candidate = path.isAbsolute(trimmed) ? trimmed : path.resolve(root, trimmed);
  return path.resolve(candidate);
}
