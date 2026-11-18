import { spawn } from "node:child_process";
import fs from "node:fs";
import { FFMPEG_PATH, FFMPEG_TIMEOUT_MS } from "@/lib/config";
import { THUMB_QUALITY, clampWidth, hashKey, loadSharp, readCached, writeCached } from "@/lib/thumbs";

/**
 * Poster frames for videos. ffmpeg decodes a single frame, sharp resizes it to
 * the same cached WebP the picture thumbnails use, so the grid treats both the
 * same way. ffmpeg is optional: without it (or when a codec cannot be decoded)
 * this returns null and the caller shows a placeholder instead.
 */

interface PosterResult {
  data: Buffer;
  mime: string;
  /** Posters are always resized: raw video bytes could not be shown in an `<img>`. */
  passthrough: false;
}

/** Set once ffmpeg proves unavailable, so we do not spawn it on every tile. */
let ffmpegMissing = false;

/** Only a couple of decodes at a time: a grid of videos must not pin every core. */
const MAX_CONCURRENT = 2;
let running = 0;
const waiting: Array<() => void> = [];

async function acquireSlot(): Promise<void> {
  if (running >= MAX_CONCURRENT) {
    await new Promise<void>((resolve) => waiting.push(resolve));
  }
  running += 1;
}

function releaseSlot(): void {
  running -= 1;
  waiting.shift()?.();
}

/** Decode one frame to JPEG on stdout. Empty output means "no frame at that time". */
function grabFrame(filePath: string, atSeconds: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      FFMPEG_PATH,
      [
        "-hide_banner",
        "-loglevel",
        "error",
        "-ss",
        String(atSeconds),
        "-i",
        filePath,
        "-frames:v",
        "1",
        "-an",
        "-f",
        "image2pipe",
        "-c:v",
        "mjpeg",
        "-q:v",
        "3",
        "pipe:1",
      ],
      { stdio: ["ignore", "pipe", "ignore"] },
    );

    const chunks: Buffer[] = [];
    let size = 0;
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, FFMPEG_TIMEOUT_MS);

    child.stdout.on("data", (chunk: Buffer) => {
      chunks.push(chunk);
      size += chunk.byteLength;
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      const missing = (error as NodeJS.ErrnoException).code === "ENOENT";
      if (missing) {
        ffmpegMissing = true;
        console.warn(
          `[gallery] ${FFMPEG_PATH} not found — videos show a placeholder. Install ffmpeg or set GALLERY_FFMPEG_PATH.`,
        );
      }
      reject(error);
    });
    child.on("close", () => {
      clearTimeout(timer);
      if (timedOut) {
        reject(new Error(`ffmpeg timed out after ${FFMPEG_TIMEOUT_MS}ms`));
        return;
      }
      resolve(Buffer.concat(chunks, size));
    });
  });
}

export async function getVideoPoster(
  filePath: string,
  stats: fs.Stats,
  requestedWidth: number,
): Promise<PosterResult | null> {
  if (ffmpegMissing || stats.size === 0) return null;
  const width = clampWidth(requestedWidth);

  // The "video|" prefix keeps poster keys apart from picture thumbnail keys.
  const key = hashKey(
    `video|${filePath}|${Math.round(stats.mtimeMs)}|${stats.size}|${width}|q${THUMB_QUALITY}`,
  );

  const cached = await readCached(key);
  if (cached) return { data: cached, mime: "image/webp", passthrough: false };

  const sharp = await loadSharp();
  if (!sharp) return null;

  await acquireSlot();
  try {
    // A short fade-in or a black first frame is common in generated clips, so
    // start half a second in and fall back to the very first frame.
    let frame = await grabFrame(filePath, 0.5).catch(() => Buffer.alloc(0));
    if (frame.byteLength === 0 && !ffmpegMissing) frame = await grabFrame(filePath, 0);
    if (frame.byteLength === 0) return null;

    const data = await sharp(frame, { failOn: "none" })
      .resize({ width, height: width, fit: "inside", withoutEnlargement: true })
      .webp({ quality: THUMB_QUALITY, effort: 5 })
      .toBuffer();

    await writeCached(key, data, filePath);
    return { data, mime: "image/webp", passthrough: false };
  } catch (error) {
    console.warn(`[gallery] poster failed for ${filePath}`, (error as Error).message);
    return null;
  } finally {
    releaseSlot();
  }
}
