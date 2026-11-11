"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  CloseIcon,
  DownloadIcon,
  SpinnerIcon,
  TrashIcon,
} from "./icons";
import { endpoints } from "@/lib/client";
import type { GalleryEntry } from "@/lib/types";

interface LightboxProps {
  images: GalleryEntry[];
  index: number;
  readOnly: boolean;
  onIndexChange: (index: number) => void;
  onClose: () => void;
  onRequestDelete: (entry: GalleryEntry) => void;
  deleting?: boolean;
}

const SWIPE_THRESHOLD = 55;

export default function Lightbox({
  images,
  index,
  readOnly,
  onIndexChange,
  onClose,
  onRequestDelete,
  deleting = false,
}: LightboxProps) {
  const count = images.length;
  const safeIndex = Math.min(Math.max(index, 0), Math.max(count - 1, 0));
  const current = images[safeIndex];

  const [drag, setDrag] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [loaded, setLoaded] = useState<Record<string, boolean>>({});
  const [failed, setFailed] = useState<Record<string, boolean>>({});
  const pointer = useRef<{ id: number; x: number; y: number; time: number } | null>(null);
  const axis = useRef<"none" | "x" | "y">("none");
  const trackRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  const visibleWindow = useMemo(() => {
    const set = new Set<number>();
    for (let offset = -1; offset <= 1; offset += 1) {
      const next = safeIndex + offset;
      if (next >= 0 && next < count) set.add(next);
    }
    return set;
  }, [safeIndex, count]);

  const go = useCallback(
    (next: number) => {
      if (count === 0) return;
      const clamped = Math.min(Math.max(next, 0), count - 1);
      if (clamped !== next) {
        // small bounce at the edges
        setDrag(0);
      }
      onIndexChange(clamped);
    },
    [count, onIndexChange],
  );

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
      switch (event.key) {
        case "Escape":
          event.preventDefault();
          onClose();
          break;
        case "ArrowRight":
          event.preventDefault();
          go(safeIndex + 1);
          break;
        case "ArrowLeft":
          event.preventDefault();
          go(safeIndex - 1);
          break;
        case "Home":
          event.preventDefault();
          go(0);
          break;
        case "End":
          event.preventDefault();
          go(count - 1);
          break;
        case "Delete":
        case "Backspace":
          if (!readOnly && current) {
            event.preventDefault();
            onRequestDelete(current);
          }
          break;
        default:
          break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [count, current, go, onClose, onRequestDelete, readOnly, safeIndex]);

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    if ((event.target as HTMLElement).closest("[data-no-drag]")) return;
    pointer.current = { id: event.pointerId, x: event.clientX, y: event.clientY, time: Date.now() };
    axis.current = "none";
    setDragging(true);
  };

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const start = pointer.current;
    if (!start || start.id !== event.pointerId) return;
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    if (axis.current === "none") {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
      axis.current = Math.abs(dx) > Math.abs(dy) ? "x" : "y";
    }
    if (axis.current !== "x") return;
    event.preventDefault();
    const atEdge = (safeIndex === 0 && dx > 0) || (safeIndex === count - 1 && dx < 0);
    setDrag(atEdge ? dx * 0.3 : dx);
  };

  const endDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    const start = pointer.current;
    if (!start || start.id !== event.pointerId) return;
    const dx = event.clientX - start.x;
    const elapsed = Math.max(Date.now() - start.time, 1);
    const velocity = Math.abs(dx) / elapsed; // px per ms
    const shouldPage = axis.current === "x" && (Math.abs(dx) > SWIPE_THRESHOLD || velocity > 0.55);
    pointer.current = null;
    axis.current = "none";
    setDragging(false);
    setDrag(0);
    if (!shouldPage) return;
    if (dx > 0) go(safeIndex - 1);
    else go(safeIndex + 1);
  };

  if (!current) return null;

  const currentLoaded = loaded[current.token] ?? false;
  const currentFailed = failed[current.token] ?? false;
  const offsetPercent = -safeIndex * 100;

  return (
    <div
      className="animate-fade-in fixed inset-0 z-40 flex flex-col bg-black"
      role="dialog"
      aria-modal="true"
      aria-label={`Image viewer, ${safeIndex + 1} of ${count}`}
    >
      {/* Top bar */}
      <header className="flex shrink-0 items-center gap-2 px-3 py-2 sm:px-4 sm:py-3">
        <span className="min-w-0 flex-1 truncate text-sm font-medium text-white/90 sm:text-base">
          {current.name}
        </span>
        <span className="hidden shrink-0 rounded-full bg-white/10 px-3 py-1 text-xs tabular-nums text-white/70 sm:inline">
          {safeIndex + 1} / {count}
        </span>
        {!readOnly ? (
          <button
            type="button"
            data-no-drag
            onClick={() => onRequestDelete(current)}
            disabled={deleting}
            title="Delete image"
            aria-label="Delete image"
            className="grid h-11 w-11 place-items-center rounded-full text-white/80 transition hover:bg-white/12 hover:text-white disabled:opacity-50"
          >
            {deleting ? <SpinnerIcon /> : <TrashIcon />}
          </button>
        ) : null}
        <a
          href={endpoints.download(current.token)}
          download={current.name}
          data-no-drag
          title="Download image"
          aria-label="Download image"
          className="grid h-11 w-11 place-items-center rounded-full text-white/80 transition hover:bg-white/12 hover:text-white"
        >
          <DownloadIcon />
        </a>
        <button
          ref={closeRef}
          type="button"
          data-no-drag
          onClick={onClose}
          title="Close (Esc)"
          aria-label="Close viewer"
          className="grid h-11 w-11 place-items-center rounded-full text-white/80 transition hover:bg-white/12 hover:text-white"
        >
          <CloseIcon />
        </button>
      </header>

      {/* Carousel */}
      <div
        ref={trackRef}
        className="relative min-h-0 flex-1 touch-pan-y overflow-hidden"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onClick={(event) => {
          if (event.target === event.currentTarget) onClose();
        }}
      >
        <div
          className={`flex h-full w-full ${dragging ? "" : "transition-transform duration-300 ease-out"}`}
          style={{
            transform: `translate3d(calc(${offsetPercent}% + ${drag}px), 0, 0)`,
          }}
        >
          {images.map((entry, position) => {
            const render = visibleWindow.has(position);
            const isCurrent = position === safeIndex;
            const ready = loaded[entry.token] ?? false;
            const broken = failed[entry.token] ?? false;
            return (
              <div
                key={entry.token}
                className="relative grid h-full w-full shrink-0 place-items-center p-2 sm:p-4"
                aria-hidden={!isCurrent}
              >
                {render ? (
                  <>
                    {!ready && !broken ? (
                      <div className="absolute inset-0 grid place-items-center">
                        <SpinnerIcon className="h-8 w-8 text-white/60" />
                      </div>
                    ) : null}
                    {broken ? (
                      <div className="max-w-sm px-6 text-center text-sm text-white/70">
                        <p className="font-medium text-white">Preview not available</p>
                        <p className="mt-1">
                          This format cannot be displayed in the browser. You can still download it.
                        </p>
                        <a
                          href={endpoints.download(entry.token)}
                          download={entry.name}
                          data-no-drag
                          className="mt-4 inline-flex h-10 items-center gap-2 rounded-xl bg-white/15 px-4 font-medium text-white hover:bg-white/25"
                        >
                          <DownloadIcon width={18} height={18} />
                          Download
                        </a>
                      </div>
                    ) : (
                      <img
                        src={endpoints.image(entry.token)}
                        alt={entry.name}
                        draggable={false}
                        onLoad={() => setLoaded((prev) => ({ ...prev, [entry.token]: true }))}
                        onError={() => setFailed((prev) => ({ ...prev, [entry.token]: true }))}
                        className={`max-h-full max-w-full select-none object-contain transition-opacity duration-200 ${
                          ready ? "opacity-100" : "opacity-0"
                        } ${broken ? "hidden" : ""}`}
                      />
                    )}
                  </>
                ) : null}
              </div>
            );
          })}
        </div>

        {count > 1 ? (
          <>
            {/* Edge arrows only from >= sm: on phones they would swallow swipes. */}
            <button
              type="button"
              data-no-drag
              onClick={() => go(safeIndex - 1)}
              disabled={safeIndex === 0}
              aria-label="Previous image"
              className="absolute left-2 top-1/2 hidden h-14 w-14 -translate-y-1/2 place-items-center rounded-full bg-black/45 text-white/90 backdrop-blur transition hover:bg-black/70 disabled:pointer-events-none disabled:opacity-0 sm:grid sm:left-4"
            >
              <ChevronLeftIcon className="h-6 w-6" />
            </button>
            <button
              type="button"
              data-no-drag
              onClick={() => go(safeIndex + 1)}
              disabled={safeIndex === count - 1}
              aria-label="Next image"
              className="absolute right-2 top-1/2 hidden h-14 w-14 -translate-y-1/2 place-items-center rounded-full bg-black/45 text-white/90 backdrop-blur transition hover:bg-black/70 disabled:pointer-events-none disabled:opacity-0 sm:grid sm:right-4"
            >
              <ChevronRightIcon className="h-6 w-6" />
            </button>
          </>
        ) : null}
      </div>

      {/* Bottom bar */}
      <footer className="flex shrink-0 items-center gap-3 px-4 py-3 text-xs text-white/60 sm:py-4 sm:text-sm">
        <span className="shrink-0 tabular-nums sm:hidden">
          {safeIndex + 1} / {count}
        </span>
        <span className="hidden min-w-0 flex-1 truncate sm:inline sm:flex-1">{current.name}</span>
        <span className="hidden flex-1 sm:inline" />
        <span className="ml-auto shrink-0 sm:ml-0">{count > 1 ? "swipe · ← →" : ""}</span>
        {count > 1 ? (
          <span className="flex shrink-0 items-center gap-1 sm:hidden">
            {/* Edge arrows would swallow swipes on phones, so they live here. */}
            <button
              type="button"
              data-no-drag
              onClick={() => go(safeIndex - 1)}
              disabled={safeIndex === 0}
              aria-label="Previous image"
              className="grid h-10 w-10 place-items-center rounded-full bg-white/10 text-white/90 disabled:opacity-30"
            >
              <ChevronLeftIcon width={18} height={18} />
            </button>
            <button
              type="button"
              data-no-drag
              onClick={() => go(safeIndex + 1)}
              disabled={safeIndex === count - 1}
              aria-label="Next image"
              className="grid h-10 w-10 place-items-center rounded-full bg-white/10 text-white/90 disabled:opacity-30"
            >
              <ChevronRightIcon width={18} height={18} />
            </button>
          </span>
        ) : null}
      </footer>
    </div>
  );
}
