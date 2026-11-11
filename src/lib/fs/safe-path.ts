import path from "node:path";
import fsSync from "node:fs";
import { ALLOWED_ROOTS, GALLERY_ROOT } from "@/lib/config";

/**
 * Every path that crosses the HTTP boundary travels as an opaque base64url
 * token. The token hides the server layout from the browser and, more
 * importantly, is always re-validated with realpath + allowed-root
 * containment before any filesystem call, which blocks `..` traversal and
 * symlink escapes.
 */

export class PathError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.name = "PathError";
    this.status = status;
  }
}

function encodeBase64url(value: string): string {
  return Buffer.from(value, "utf8").toString("base64url");
}

/** NUL and other C0/C1 controls are never legal in a real path. */
const CONTROL_CHARS = /[\u0000-\u001f\u007f-\u009f]/;

function decodeBase64url(value: string): string {
  return Buffer.from(value, "base64url").toString("utf8");
}

export function toToken(absPath: string): string {
  return encodeBase64url(absPath);
}

export function decodeToken(token: string): string {
  let decoded: string;
  try {
    decoded = decodeBase64url(token);
  } catch {
    throw new PathError("Invalid path token");
  }
  // Control characters (NUL included) survive base64 round-trips and make
  // fs calls throw TypeError deep inside Node, so reject them here.
  if (!decoded || !path.isAbsolute(decoded) || CONTROL_CHARS.test(decoded)) {
    throw new PathError("Invalid path token");
  }
  return path.normalize(decoded);
}

/** Realpath of a path, tolerating not-yet-existing leaves. */
export function realPathOrNearest(target: string): string {
  let current = path.resolve(target);
  const missing: string[] = [];
  for (;;) {
    try {
      const real = fsSync.realpathSync(current);
      return missing.length ? path.join(real, ...missing.reverse()) : real;
    } catch {
      const parent = path.dirname(current);
      if (parent === current) return path.resolve(target);
      missing.push(path.basename(current));
      current = parent;
    }
  }
}

export function realPathStrict(target: string): string {
  try {
    return fsSync.realpathSync(target);
  } catch {
    throw new PathError("Path does not exist", 404);
  }
}

function isInside(root: string, target: string): boolean {
  const relative = path.relative(root, target);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function allowedRootsReal(): string[] {
  const roots: string[] = [];
  for (const root of ALLOWED_ROOTS) {
    try {
      roots.push(fsSync.realpathSync(root));
    } catch {
      // Configured root is currently not mounted — skip it instead of failing.
    }
  }
  if (roots.length === 0) {
    // Always keep the gallery root addressable, even when it is missing.
    roots.push(realPathOrNearest(GALLERY_ROOT));
  }
  return Array.from(new Set(roots));
}

export function allowedRoots(): string[] {
  return allowedRootsReal();
}

export function assertInsideAllowedRoots(realTarget: string): void {
  const roots = allowedRootsReal();
  if (!roots.some((root) => isInside(root, realTarget))) {
    throw new PathError(
      "Path is outside the allowed directories (configure GALLERY_ALLOWED_ROOTS)",
      403,
    );
  }
}

export function isAllowedRealPath(realTarget: string): boolean {
  try {
    assertInsideAllowedRoots(realTarget);
    return true;
  } catch {
    return false;
  }
}

/** Token -> existing, allowed absolute path. */
export function resolveToken(token: string | null | undefined): string {
  if (!token) throw new PathError("Missing path token");
  const decoded = decodeToken(token);
  const real = realPathStrict(decoded);
  assertInsideAllowedRoots(real);
  return real;
}

/** Token -> allowed absolute path even when the target is gone (delete flows). */
export function resolveTokenLoose(token: string | null | undefined): string {
  if (!token) throw new PathError("Missing path token");
  const decoded = decodeToken(token);
  const real = realPathOrNearest(decoded);
  assertInsideAllowedRoots(real);
  return real;
}

export function isGalleryRoot(realTarget: string): boolean {
  return realTarget === realPathOrNearest(GALLERY_ROOT);
}

/** True when the path is one of the configured allowed roots itself. */
export function isAllowedRoot(realTarget: string): boolean {
  return allowedRootsReal().includes(realTarget);
}

export function displayRoots(): Array<{ token: string; name: string }> {
  return allowedRootsReal().map((root) => ({
    token: toToken(root),
    name: root === realPathOrNearest(GALLERY_ROOT) ? "Gallery root" : root,
  }));
}

export { isInside };
