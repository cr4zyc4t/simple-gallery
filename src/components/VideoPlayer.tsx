"use client";

import { useEffect, useRef, useState } from "react";
import { CloseIcon, DownloadIcon, SpinnerIcon, TrashIcon, VideoIcon } from "./icons";
import { endpoints } from "@/lib/client";
import { formatBytes, formatDate } from "@/lib/format";
import type { GalleryEntry } from "@/lib/types";

interface VideoPlayerProps {
  entry: GalleryEntry;
  readOnly: boolean;
  onClose: () => void;
  onRequestDelete: (entry: GalleryEntry) => void;
  deleting?: boolean;
  /** A dialog is on top of the player: it owns Esc and Delete. */
  dialogOpen?: boolean;
}

/**
 * Standalone player for one video. Deliberately not part of the picture
 * carousel: there is no paging, no zoom and no swipe — the browser's own
 * controls own the whole surface, which is what makes scrubbing and volume
 * behave the way people expect. Back/Esc closes it, like any other screen.
 */
export default function VideoPlayer({
  entry,
  readOnly,
  onClose,
  onRequestDelete,
  deleting = false,
  dialogOpen = false,
}: VideoPlayerProps) {
  const [failed, setFailed] = useState(false);
  const [started, setStarted] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeRef.current?.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      // A confirm dialog on top of the player answers Esc and Delete first, so
      // dismissing the delete prompt does not also close the player.
      if (dialogOpen && (event.key === "Escape" || event.key === "Delete" || event.key === "Backspace")) {
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      } else if ((event.key === "Delete" || event.key === "Backspace") && !readOnly) {
        event.preventDefault();
        onRequestDelete(entry);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dialogOpen, entry, onClose, onRequestDelete, readOnly]);

  return (
    <div
      className="animate-fade-in fixed inset-0 z-40 flex flex-col bg-black"
      role="dialog"
      aria-modal="true"
      aria-label={`Video player, ${entry.name}`}
    >
      <header className="flex shrink-0 items-center gap-2 px-3 py-2 sm:px-4 sm:py-3">
        <span className="min-w-0 flex-1 break-words text-sm leading-snug font-medium text-white/90 sm:text-base">
          {entry.name}
        </span>
        {!readOnly ? (
          <button
            type="button"
            onClick={() => onRequestDelete(entry)}
            disabled={deleting}
            title="Delete video"
            aria-label="Delete video"
            className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-white/80 transition hover:bg-white/12 hover:text-white disabled:opacity-50"
          >
            {deleting ? <SpinnerIcon /> : <TrashIcon />}
          </button>
        ) : null}
        <a
          href={endpoints.download(entry.token)}
          download={entry.name}
          title="Download video"
          aria-label="Download video"
          className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-white/80 transition hover:bg-white/12 hover:text-white"
        >
          <DownloadIcon />
        </a>
        <button
          ref={closeRef}
          type="button"
          onClick={onClose}
          title="Close (Esc)"
          aria-label="Close player"
          className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-white/80 transition hover:bg-white/12 hover:text-white"
        >
          <CloseIcon />
        </button>
      </header>

      <div
        className="relative grid min-h-0 flex-1 place-items-center p-2 sm:p-4"
        onClick={(event) => {
          // Anything that is not the player itself is the backdrop.
          if ((event.target as HTMLElement).closest("video")) return;
          onClose();
        }}
      >
        {failed ? (
          <div className="max-w-sm px-6 text-center text-sm text-white/70">
            <p className="font-medium text-white">This video cannot be played here</p>
            <p className="mt-1">
              Your browser has no decoder for this container. The poster still works, and you can
              download the file.
            </p>
            <a
              href={endpoints.download(entry.token)}
              download={entry.name}
              className="mt-4 inline-flex h-10 items-center gap-2 rounded-xl bg-white/15 px-4 font-medium text-white hover:bg-white/25"
            >
              <DownloadIcon width={18} height={18} />
              Download
            </a>
          </div>
        ) : (
          <>
            {!started ? (
              <div className="absolute inset-0 grid place-items-center">
                <SpinnerIcon className="h-8 w-8 text-white/60" />
              </div>
            ) : null}
            <video
              // The poster is the same cached WebP the grid used, so the first
              // frame is on screen before the video has loaded.
              poster={endpoints.thumb(entry.token, 1280)}
              src={endpoints.image(entry.token)}
              aria-label={entry.name}
              controls
              autoPlay
              playsInline
              preload="metadata"
              onLoadedData={() => setStarted(true)}
              onError={() => setFailed(true)}
              className="max-h-full max-w-full bg-black"
            />
          </>
        )}
      </div>

      <footer className="flex shrink-0 items-center gap-3 px-4 py-3 text-xs text-white/60 sm:py-4 sm:text-sm">
        <span className="inline-flex min-w-0 items-center gap-1.5">
          <VideoIcon width={16} height={16} className="shrink-0" />
          <span className="break-words leading-snug">{entry.name}</span>
        </span>
        <span className="hidden shrink-0 sm:inline">{formatDate(entry.modifiedAt)}</span>
        <span className="shrink-0 tabular-nums">{formatBytes(entry.sizeBytes)}</span>
        <span className="ml-auto shrink-0">Esc to close</span>
      </footer>
    </div>
  );
}
