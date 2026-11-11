import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { isImageFile, GALLERY_ROOT } from "@/lib/config";
import {
  PathError,
  displayRoots,
  isAllowedRoot,
  isAllowedRealPath,
  isInside,
  isGalleryRoot,
  realPathOrNearest,
  toToken,
} from "./safe-path";
import type { BrowseEntry, BrowseResponse, GalleryEntry } from "@/lib/types";

const IGNORED_NAMES = new Set([".DS_Store", "Thumbs.db", "desktop.ini", "@eaDir", "__MACOSX"]);
const IGNORED_PREFIXES = [".", "~$"];

const nameCollator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

function isIgnored(name: string): boolean {
  if (IGNORED_NAMES.has(name)) return true;
  return IGNORED_PREFIXES.some((prefix) => name.startsWith(prefix));
}

export function ensureRootExists(): void {
  try {
    fs.mkdirSync(GALLERY_ROOT, { recursive: true });
  } catch {
    // Read-only mount or missing volume — listing will surface the error.
  }
}

export async function readDirNames(dir: string): Promise<string[]> {
  try {
    return await fsp.readdir(dir);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "EACCES" || code === "EPERM") {
      throw new PathError(`Permission denied: ${path.basename(dir)}`, 403);
    }
    if (code === "ENOENT") throw new PathError("Folder not found", 404);
    throw error;
  }
}

interface DirChild {
  name: string;
  realPath: string;
  isDirectory: boolean;
  mtimeMs: number;
  size: number;
}

/** Read a directory's direct children, resolving symlinks and rejecting escapes. */
export async function readChildren(dir: string): Promise<DirChild[]> {
  const names = await readDirNames(dir);
  const children: DirChild[] = [];
  await Promise.all(
    names.map(async (name) => {
      if (isIgnored(name)) return;
      const childPath = path.join(dir, name);
      let stats: fs.Stats;
      try {
        stats = await fsp.stat(childPath); // follows symlinks
      } catch {
        return; // dangling symlink / unreadable entry / racing delete
      }
      const real = realPathOrNearest(childPath);
      if (!isAllowedRealPath(real)) return; // symlink pointing outside allowed roots
      if (!stats.isDirectory() && !stats.isFile()) return; // sockets, fifos, devices
      children.push({
        name,
        realPath: real,
        isDirectory: stats.isDirectory(),
        mtimeMs: stats.mtimeMs,
        size: stats.size,
      });
    }),
  );
  return children;
}

function toEntry(child: DirChild): GalleryEntry {
  return {
    kind: child.isDirectory ? "folder" : "image",
    name: child.name,
    token: toToken(child.realPath),
    modifiedAt: Number.isFinite(child.mtimeMs) ? Math.round(child.mtimeMs) : null,
    sizeBytes: child.isDirectory ? null : child.size,
    extension: child.isDirectory ? null : path.extname(child.name).toLowerCase(),
    coverToken: null,
  };
}

/** First picture inside a folder (non-recursive) — used as its cover thumbnail. */
async function findCover(dir: string): Promise<string | null> {
  try {
    const children = await fsp.readdir(dir, { withFileTypes: true });
    const name = children
      .filter((child) => (child.isFile() || child.isSymbolicLink()) && !isIgnored(child.name) && isImageFile(child.name))
      .map((child) => child.name)
      .sort(nameCollator.compare)[0];
    if (!name) return null;
    const real = realPathOrNearest(path.join(dir, name));
    return isAllowedRealPath(real) ? toToken(real) : null;
  } catch {
    return null; // unreadable folder simply shows the folder icon
  }
}

/**
 * Folder contents: sub-folders and pictures only (other file types are hidden),
 * folders first, then by the requested ordering.
 */
export async function listGalleryDir(
  dir: string,
  sort: { key: "name" | "date"; dir: "asc" | "desc" } = { key: "name", dir: "asc" },
): Promise<GalleryEntry[]> {
  const children = (await readChildren(dir)).filter(
    (child) => child.isDirectory || isImageFile(child.name),
  );

  const entries = await Promise.all(
    children.map(async (child): Promise<GalleryEntry> => ({
      ...toEntry(child),
      coverToken: child.isDirectory ? await findCover(child.realPath) : null,
    })),
  );
  const factor = sort.dir === "desc" ? -1 : 1;
  entries.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === "folder" ? -1 : 1; // folders first, always
    if (sort.key === "date") {
      const diff = (a.modifiedAt ?? 0) - (b.modifiedAt ?? 0);
      if (diff !== 0) return diff * factor;
      return nameCollator.compare(a.name, b.name);
    }
    const diff = nameCollator.compare(a.name, b.name);
    return diff === 0 ? 0 : diff * factor;
  });
  return entries;
}

/** Sub-folders of a directory that contain at least one picture (recursively cheap check). */
export async function browseDir(dir: string): Promise<BrowseEntry[]> {
  const children = await readChildren(dir);
  const dirs = children.filter((child) => child.isDirectory);
  const entries = await Promise.all(
    dirs.map(async (child) => ({
      name: child.name,
      token: toToken(child.realPath),
      hasChildren: await hasSubDirectories(child.realPath),
    })),
  );
  return entries.sort((a, b) => nameCollator.compare(a.name, b.name));
}

async function hasSubDirectories(dir: string): Promise<boolean> {
  try {
    const children = await fsp.readdir(dir, { withFileTypes: true });
    return children.some((child) => {
      if (isIgnored(child.name)) return false;
      return child.isDirectory() || child.isSymbolicLink();
    });
  } catch {
    return false;
  }
}

export function buildBrowseResponse(dir: string | null): BrowseResponse {
  const roots = displayRoots();
  if (!dir) {
    return { current: null, roots, entries: [], readOnly: false };
  }
  const parent = path.dirname(dir);
  const atRoot = isAllowedRoot(dir) || parent === dir;
  const parentToken = !atRoot && isAllowedRealPath(parent) ? toToken(parent) : null;
  return {
    current: { token: toToken(dir), name: path.basename(dir) || dir, parentToken },
    roots,
    entries: [],
    readOnly: false,
  };
}

/** Breadcrumb trail from the closest containing allowed root down to `dir`. */
export function buildTrail(dir: string): Array<{ token: string; name: string }> {
  const roots = displayRoots();
  const match = roots
    .map((root) => ({ root, real: realPathOrNearest(decodeRootToken(root.token)) }))
    .filter(({ real }) => isInside(real, dir))
    .sort((a, b) => b.real.length - a.real.length)[0];
  if (!match) return [{ token: toToken(dir), name: path.basename(dir) || dir }];

  const relative = path.relative(match.real, dir);
  const trail: Array<{ token: string; name: string }> = [
    { token: match.root.token, name: match.root.name },
  ];
  if (!relative) return trail;
  let cursor = match.real;
  for (const segment of relative.split(path.sep)) {
    cursor = path.join(cursor, segment);
    trail.push({ token: toToken(cursor), name: segment });
  }
  return trail;
}

function decodeRootToken(token: string): string {
  return Buffer.from(token, "base64url").toString("utf8");
}

export async function isEmptyDir(dir: string): Promise<boolean> {
  const children = await readChildren(dir);
  return children.length === 0;
}

export async function countChildren(dir: string): Promise<{ folders: number; images: number; other: number }> {
  const children = await readChildren(dir);
  let folders = 0;
  let images = 0;
  let other = 0;
  for (const child of children) {
    if (child.isDirectory) folders += 1;
    else if (isImageFile(child.name)) images += 1;
    else other += 1;
  }
  return { folders, images, other };
}

export function folderInfo(rawDir: string, inLibrary: boolean) {
  const dir = realPathOrNearest(rawDir);
  const parent = path.dirname(dir);
  const isRootNode = isGalleryRoot(dir) || isAllowedRoot(dir);
  return {
    token: toToken(dir),
    name: path.basename(dir) || dir,
    parentToken:
      isRootNode || !isAllowedRealPath(parent) || parent === dir ? null : toToken(parent),
    isRoot: isRootNode,
    trail: buildTrail(dir),
    isAllowedRoot: isAllowedRoot(dir),
    inLibrary,
  };
}

/** Delete a single picture. Never accepts directories. */
export async function deleteImageFile(filePath: string): Promise<void> {
  let stats: fs.Stats;
  try {
    stats = await fsp.stat(filePath);
  } catch {
    throw new PathError("Image not found", 404);
  }
  if (stats.isDirectory()) throw new PathError("Refusing to delete a folder here", 400);
  await fsp.rm(filePath, { force: true });
}

/**
 * Delete a folder and everything inside it. Refuses to delete the gallery root
 * or any configured allowed root, and double-checks containment right before the
 * recursive remove.
 */
export async function deleteFolderTree(dir: string): Promise<void> {
  let stats: fs.Stats;
  try {
    stats = await fsp.stat(dir);
  } catch {
    throw new PathError("Folder not found", 404);
  }
  if (!stats.isDirectory()) throw new PathError("Not a folder", 400);
  if (isGalleryRoot(dir) || isAllowedRoot(dir)) {
    throw new PathError("The gallery root cannot be deleted", 400);
  }
  const real = realPathOrNearest(dir);
  if (!isAllowedRealPath(real)) throw new PathError("Path is not deletable", 403);
  await fsp.rm(real, { recursive: true, force: false });
}

export { nameCollator };
