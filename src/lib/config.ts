import path from "node:path";

/**
 * Runtime configuration, everything is driven by environment variables so the
 * same image can be mounted against different media directories.
 */

function splitList(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(/[,:;]/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function resolveEnv(p: string): string {
  return path.resolve(process.cwd(), p);
}

/** Directory shown when the app starts ("default folder"). */
export const GALLERY_ROOT = resolveEnv(process.env.GALLERY_ROOT ?? "./media");

/**
 * Filesystem areas the app is allowed to read / delete inside.
 * Defaults to the gallery root only, which keeps the app safe by default.
 * Set `GALLERY_ALLOWED_ROOTS=/` (docker: mount what you need) to browse wider.
 */
export const ALLOWED_ROOTS: string[] = (() => {
  const configured = splitList(process.env.GALLERY_ALLOWED_ROOTS);
  const roots = configured.length > 0 ? configured : [GALLERY_ROOT];
  const resolved = roots.map((root) => resolveEnv(root));
  // The default gallery root is always reachable.
  if (!resolved.some((root) => root === GALLERY_ROOT)) resolved.push(GALLERY_ROOT);
  return Array.from(new Set(resolved));
})();

export const DB_PATH = resolveEnv(process.env.GALLERY_DB_PATH ?? "./data/gallery.db");

/** Thumbnails cache directory (persisted next to the db inside the docker volume). */
export const CACHE_DIR = resolveEnv(
  process.env.GALLERY_CACHE_DIR ?? path.join(path.dirname(DB_PATH), "thumbs"),
);

/** Deleting / downloading is disabled when the app runs in read-only mode. */
export const READ_ONLY = /^(1|true|yes|on)$/i.test(process.env.GALLERY_READ_ONLY ?? "");

/** Hard cap for the preview pipeline — bigger files are streamed untouched. */
export const MAX_PREVIEW_BYTES = Number(process.env.GALLERY_MAX_PREVIEW_BYTES ?? 64 * 1024 * 1024);

/** Extensions treated as pictures. */
export const IMAGE_EXTENSIONS = [
  ".jpg",
  ".jpeg",
  ".jpe",
  ".png",
  ".gif",
  ".webp",
  ".avif",
  ".bmp",
  ".svg",
  ".svgz",
  ".ico",
  ".tif",
  ".tiff",
  ".heic",
  ".heif",
] as const;

/** Formats sharp can reliably re-encode for thumbnails. */
export const THUMBNAIL_FORMATS = new Set([
  ".jpg",
  ".jpeg",
  ".jpe",
  ".png",
  ".gif",
  ".webp",
  ".avif",
  ".bmp",
  ".svg",
  ".svgz",
  ".tif",
  ".tiff",
  ".heic",
  ".heif",
]);

export const MIME_TYPES: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".jpe": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".bmp": "image/bmp",
  ".svg": "image/svg+xml",
  ".svgz": "image/svg+xml",
  ".ico": "image/vnd.microsoft.icon",
  ".tif": "image/tiff",
  ".tiff": "image/tiff",
  ".heic": "image/heic",
  ".heif": "image/heif",
};

export function mimeFor(filePath: string): string {
  return MIME_TYPES[path.extname(filePath).toLowerCase()] ?? "application/octet-stream";
}

export function isImageFile(filePath: string): boolean {
  return (IMAGE_EXTENSIONS as readonly string[]).includes(path.extname(filePath).toLowerCase());
}
