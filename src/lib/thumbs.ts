import crypto from "node:crypto";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { CACHE_DIR, MAX_PREVIEW_BYTES } from "@/lib/config";

/**
 * On-disk thumbnail cache. sharp is imported lazily so the app still runs (by
 * serving original bytes) on platforms without a prebuilt libvips.
 */

type SharpFactory = typeof import("sharp");
let sharpPromise: Promise<SharpFactory | null> | null = null;

function loadSharp(): Promise<SharpFactory | null> {
  sharpPromise ??= import("sharp")
    .then((mod) => {
      const candidate = mod as unknown as { default?: SharpFactory };
      if (typeof candidate.default === "function") return candidate.default;
      if (typeof mod === "function") return mod as unknown as SharpFactory;
      throw new Error("unexpected sharp module shape");
    })
    .catch((error) => {
      console.warn("[gallery] sharp unavailable, serving original images instead", error);
      return null;
    });
  return sharpPromise;
}

export const THUMB_QUALITY = 74;
const INDEX_FILE = "index.jsonl";

function hashKey(input: string): string {
  return crypto.createHash("sha1").update(input).digest("hex");
}

function clampWidth(requested: number): number {
  const width = Number.isFinite(requested) ? Math.round(requested) : 256;
  if (width <= 0) return 256;
  return Math.min(Math.max(width, 64), 1280);
}

interface ThumbResult {
  data: Buffer;
  mime: string;
  /** true when sharp was unavailable/failing and raw file bytes are returned. */
  passthrough: boolean;
}

async function readOriginal(filePath: string): Promise<ThumbResult> {
  const data = await fsp.readFile(filePath);
  return { data, mime: "image/octet-stream", passthrough: true };
}

export async function getThumbnail(
  filePath: string,
  stats: fs.Stats,
  requestedWidth: number,
): Promise<ThumbResult> {
  const width = clampWidth(requestedWidth);

  if (stats.size > MAX_PREVIEW_BYTES) return readOriginal(filePath);

  const sharp = await loadSharp();
  if (!sharp) return readOriginal(filePath);

  const key = hashKey(`${filePath}|${Math.round(stats.mtimeMs)}|${stats.size}|${width}|q${THUMB_QUALITY}`);
  const cacheFile = path.join(CACHE_DIR, `${key}.webp`);

  try {
    const cached = await fsp.readFile(cacheFile);
    return { data: cached, mime: "image/webp", passthrough: false };
  } catch {
    // cache miss — generated below
  }

  try {
    const data = await sharp(filePath, { animated: true, failOn: "none" })
      .rotate()
      .resize({ width, height: width, fit: "inside", withoutEnlargement: true })
      .webp({ quality: THUMB_QUALITY, effort: 5 })
      .toBuffer();

    await fsp.mkdir(CACHE_DIR, { recursive: true });
    const temp = `${cacheFile}.${process.pid}.${Math.random().toString(36).slice(2)}.tmp`;
    await fsp.writeFile(temp, data);
    try {
      await fsp.rename(temp, cacheFile);
    } catch {
      await fsp.rm(temp, { force: true });
    }
    await fsp
      .appendFile(path.join(CACHE_DIR, INDEX_FILE), `${key}\t${filePath}\n`, "utf8")
      .catch(() => undefined);
    return { data, mime: "image/webp", passthrough: false };
  } catch (error) {
    console.warn(`[gallery] thumbnail failed for ${filePath}`, (error as Error).message);
    return readOriginal(filePath);
  }
}

/**
 * Drop cached thumbnails belonging to a deleted file or folder tree.
 * Best effort: never throws, a stale cache entry is harmless.
 */
export function purgeCacheFor(target: string): void {
  try {
    const index = path.join(CACHE_DIR, INDEX_FILE);
    if (!fs.existsSync(index)) return;
    const lines = fs.readFileSync(index, "utf8").split("\n");
    const kept: string[] = [];
    const stale: string[] = [];
    for (const line of lines) {
      const separator = line.indexOf("\t");
      if (separator <= 0) continue;
      const hash = line.slice(0, separator);
      const source = line.slice(separator + 1);
      const belongs = source === target || source.startsWith(`${target}${path.sep}`);
      if (belongs) stale.push(hash);
      else kept.push(line);
    }
    for (const hash of stale) {
      fs.rmSync(path.join(CACHE_DIR, `${hash}.webp`), { force: true });
    }
    if (stale.length > 0) {
      fs.writeFileSync(index, kept.length ? `${kept.join("\n")}\n` : "", "utf8");
    }
  } catch (error) {
    console.warn("[gallery] thumbnail cache purge failed", (error as Error).message);
  }
}
