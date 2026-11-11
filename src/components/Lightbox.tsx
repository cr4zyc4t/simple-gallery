"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  CloseIcon,
  DownloadIcon,
  SpinnerIcon,
  TrashIcon,
  ZoomOutIcon,
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
const MAX_SCALE = 5;

/** Zoom/pan state of the visible picture; the carousel itself never scales. */
interface View {
  scale: number;
  x: number;
  y: number;
}

const IDENTITY: View = { scale: 1, x: 0, y: 0 };

function clampScale(value: number): number {
  return Math.min(Math.max(value, 1), MAX_SCALE);
}

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
  const [view, setView] = useState<View>(IDENTITY);
  const [gesturing, setGesturing] = useState(false);
  const [loaded, setLoaded] = useState<Record<string, boolean>>({});
  const [failed, setFailed] = useState<Record<string, boolean>>({});
  const pointer = useRef<{ id: number; x: number; y: number; time: number } | null>(null);
  const axis = useRef<"none" | "x" | "y">("none");
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ dist: number; scale: number; midX: number; midY: number; view: View } | null>(
    null,
  );
  const pan = useRef<{ x: number; y: number; viewX: number; viewY: number } | null>(null);
  /** True once the pointer has actually dragged, so the trailing click is ignored. */
  const moved = useRef(false);
  const trackRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  const viewRef = useRef(view);
  viewRef.current = view;
  const zoomed = view.scale > 1.01;
  const zoomedRef = useRef(zoomed);
  zoomedRef.current = zoomed;

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
      setView(IDENTITY);
      onIndexChange(clamped);
    },
    [count, onIndexChange],
  );

  /** Keep the picture inside its own scaled edges. */
  const clampToBox = useCallback((next: View): View => {
    if (next.scale <= 1.02) return IDENTITY;
    const box = trackRef.current;
    if (!box) return next;
    const maxX = ((next.scale - 1) * box.clientWidth) / 2;
    const maxY = ((next.scale - 1) * box.clientHeight) / 2;
    return {
      scale: next.scale,
      x: Math.min(Math.max(next.x, -maxX), maxX),
      y: Math.min(Math.max(next.y, -maxY), maxY),
    };
  }, []);

  /** Keep the content point under (px, py) — measured from the box centre — pinned. */
  const zoomAround = useCallback(
    (from: View, scale: number, px: number, py: number): View => {
      const next = clampScale(scale);
      const ratio = next / from.scale;
      return clampToBox({
        scale: next,
        x: px - (px - from.x) * ratio,
        y: py - (py - from.y) * ratio,
      });
    },
    [clampToBox],
  );

  const boxPoint = useCallback((clientX: number, clientY: number) => {
    const box = trackRef.current?.getBoundingClientRect();
    if (!box) return { x: 0, y: 0 };
    return { x: clientX - (box.left + box.width / 2), y: clientY - (box.top + box.height / 2) };
  }, []);

  const toggleZoom = useCallback(
    (px: number, py: number) => {
      setView((from) => (from.scale > 1.05 ? IDENTITY : zoomAround(from, 2.5, px, py)));
    },
    [zoomAround],
  );

  // Reset zoom when the picture changes or the viewer closes.
  useEffect(() => {
    setView(IDENTITY);
  }, [safeIndex]);

  useEffect(() => {
    closeRef.current?.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  // Wheel / trackpad pinch. Registered natively so preventDefault is allowed.
  useEffect(() => {
    const box = trackRef.current;
    if (!box) return;
    const onWheel = (event: WheelEvent) => {
      const delta = event.deltaMode === 1 ? event.deltaY * 16 : event.deltaY;
      if (!delta) return;
      event.preventDefault();
      const point = boxPoint(event.clientX, event.clientY);
      const factor = Math.exp(-delta * (event.ctrlKey ? 0.01 : 0.0018));
      setView((from) => zoomAround(from, from.scale * factor, point.x, point.y));
    };
    box.addEventListener("wheel", onWheel, { passive: false });
    return () => box.removeEventListener("wheel", onWheel);
  }, [boxPoint, zoomAround]);

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
        case "0":
          if (zoomedRef.current) {
            event.preventDefault();
            setView(IDENTITY);
          }
          break;
        case "+":
        case "=": {
          event.preventDefault();
          setView((from) => zoomAround(from, from.scale * 1.3, 0, 0));
          break;
        }
        case "-":
        case "_": {
          event.preventDefault();
          setView((from) => zoomAround(from, from.scale / 1.3, 0, 0));
          break;
        }
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
  }, [count, current, go, onClose, onRequestDelete, readOnly, safeIndex, zoomAround]);

  const beginPinch = () => {
    const [a, b] = [...pointers.current.values()];
    if (!a || !b) return;
    const mid = boxPoint((a.x + b.x) / 2, (a.y + b.y) / 2);
    pinch.current = {
      dist: Math.max(Math.hypot(a.x - b.x, a.y - b.y), 1),
      scale: viewRef.current.scale,
      midX: mid.x,
      midY: mid.y,
      view: viewRef.current,
    };
    pointer.current = null;
    pan.current = null;
    axis.current = "none";
    setDragging(false);
    setDrag(0);
    setGesturing(true);
  };

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    if ((event.target as HTMLElement).closest("[data-no-drag]")) return;
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    moved.current = false;
    if (pointers.current.size >= 2) {
      beginPinch();
      return;
    }
    pointer.current = { id: event.pointerId, x: event.clientX, y: event.clientY, time: Date.now() };
    axis.current = "none";
    pan.current = zoomedRef.current
      ? { x: event.clientX, y: event.clientY, viewX: viewRef.current.x, viewY: viewRef.current.y }
      : null;
    setDragging(true);
    setGesturing(true);
  };

  /** Grab the pointer only once a real drag starts: capturing a tap would move
   the click target off the picture and break double-click and backdrop close. */
  const capture = (event: React.PointerEvent<HTMLDivElement>) => {
    if (moved.current) return;
    moved.current = true;
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // capture is a nicety; gestures still work without it
    }
  };

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const tracked = pointers.current.get(event.pointerId);
    if (tracked) {
      tracked.x = event.clientX;
      tracked.y = event.clientY;
    }

    if (pinch.current && pointers.current.size >= 2) {
      const [a, b] = [...pointers.current.values()];
      if (!a || !b) return;
      const start = pinch.current;
      const distance = Math.max(Math.hypot(a.x - b.x, a.y - b.y), 1);
      const mid = boxPoint((a.x + b.x) / 2, (a.y + b.y) / 2);
      const scale = clampScale((start.scale * distance) / start.dist);
      const ratio = scale / start.scale;
      // The content point under where the gesture started stays under the
      // fingers, so zooming tracks the pinch and two fingers also pan.
      setView(
        clampToBox({
          scale,
          x: mid.x - (start.midX - start.view.x) * ratio,
          y: mid.y - (start.midY - start.view.y) * ratio,
        }),
      );
      capture(event);
      event.preventDefault();
      return;
    }

    const start = pointer.current;
    if (!start || start.id !== event.pointerId) return;
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;

    // Zoomed in: one finger drags the picture instead of paging.
    const panStart = pan.current;
    if (panStart) {
      capture(event);
      event.preventDefault();
      setView((from) =>
        clampToBox({ scale: from.scale, x: panStart.viewX + dx, y: panStart.viewY + dy }),
      );
      return;
    }

    if (axis.current === "none") {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
      axis.current = Math.abs(dx) > Math.abs(dy) ? "x" : "y";
    }
    if (axis.current !== "x") return;
    capture(event);
    event.preventDefault();
    const atEdge = (safeIndex === 0 && dx > 0) || (safeIndex === count - 1 && dx < 0);
    setDrag(atEdge ? dx * 0.3 : dx);
  };

  const endGesture = (event: React.PointerEvent<HTMLDivElement>) => {
    pointers.current.delete(event.pointerId);
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      // ignore
    }

    if (pinch.current) {
      pinch.current = null;
      setGesturing(false);
      if (viewRef.current.scale <= 1.05) setView(IDENTITY);
      // Hand the remaining finger over to pan/swipe without a jump.
      const rest = [...pointers.current.entries()][0];
      if (rest) {
        pointer.current = { id: rest[0], x: rest[1].x, y: rest[1].y, time: Date.now() };
        pan.current = viewRef.current.scale > 1.05
          ? { x: rest[1].x, y: rest[1].y, viewX: viewRef.current.x, viewY: viewRef.current.y }
          : null;
        setDragging(true);
      } else {
        pointer.current = null;
        pan.current = null;
        setDragging(false);
      }
      return;
    }

    const start = pointer.current;
    if (!start || start.id !== event.pointerId) return;
    const dx = event.clientX - start.x;
    const elapsed = Math.max(Date.now() - start.time, 1);

    const velocity = Math.abs(dx) / elapsed; // px per ms
    const shouldPage =
      !zoomedRef.current && axis.current === "x" && (Math.abs(dx) > SWIPE_THRESHOLD || velocity > 0.55);
    pointer.current = null;
    pan.current = null;
    axis.current = "none";
    setDragging(false);
    setGesturing(false);
    setDrag(0);
    if (!shouldPage) return;
    if (dx > 0) go(safeIndex - 1);
    else go(safeIndex + 1);
  };

  const abandonGesture = (event: React.PointerEvent<HTMLDivElement>) => {
    pointers.current.delete(event.pointerId);
    if (pointers.current.size === 0) {
      pinch.current = null;
      pointer.current = null;
      pan.current = null;
      axis.current = "none";
      setDragging(false);
      setGesturing(false);
      setDrag(0);
    } else if (pinch.current) {
      pinch.current = null;
      setGesturing(false);
    }
  };

  if (!current) return null;

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
            className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-white/80 transition hover:bg-white/12 hover:text-white disabled:opacity-50"
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
          className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-white/80 transition hover:bg-white/12 hover:text-white"
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
          className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-white/80 transition hover:bg-white/12 hover:text-white"
        >
          <CloseIcon />
        </button>
      </header>

      {/* Carousel */}
      <div
        ref={trackRef}
        className={`relative min-h-0 flex-1 touch-none overflow-hidden select-none ${
          zoomed ? (dragging ? "cursor-grabbing" : "cursor-grab") : ""
        }`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endGesture}
        onPointerCancel={abandonGesture}
        // Browsers synthesise dblclick for a double tap too, so this covers touch.
        onDoubleClick={(event) => {
          if (!(event.target as HTMLElement).closest("img")) return;
          const point = boxPoint(event.clientX, event.clientY);
          toggleZoom(point.x, point.y);
        }}
        onClick={(event) => {
          if (moved.current) {
            moved.current = false;
            return;
          }
          // The slides fill the whole track, so "clicked the background" means
          // "clicked anything that is not the picture or a control".
          const target = event.target as HTMLElement;
          if (target.closest("img") || target.closest("[data-no-drag]")) return;
          onClose();
        }}
      >
        <div
          className={`flex h-full w-full ${dragging && !gesturing ? "" : "transition-transform duration-300 ease-out"}`}
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
                        style={
                          isCurrent
                            ? {
                                transform: `translate3d(${view.x}px, ${view.y}px, 0) scale(${view.scale})`,
                                transition: gesturing ? "none" : "transform 160ms ease-out",
                              }
                            : undefined
                        }
                        className={`max-h-full max-w-full object-contain transition-opacity duration-200 ${
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

        {count > 1 && !zoomed ? (
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
        {zoomed ? (
          <button
            type="button"
            data-no-drag
            onClick={() => setView(IDENTITY)}
            aria-label="Reset zoom"
            title="Reset zoom (0)"
            className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full bg-white/12 px-3 text-white/90 transition hover:bg-white/20"
          >
            <ZoomOutIcon width={16} height={16} />
            <span className="tabular-nums">{Math.round(view.scale * 100)}%</span>
          </button>
        ) : null}
        <span className="hidden flex-1 sm:inline" />
        <span className="ml-auto shrink-0 sm:ml-0">
          {zoomed
            ? "drag to pan"
            : [count > 1 ? "swipe" : null, "pinch", count > 1 ? "← →" : null]
                .filter(Boolean)
                .join(" · ")}
        </span>
        {count > 1 && !zoomed ? (
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
