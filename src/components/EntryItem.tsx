"use client";
import { useCallback, useEffect, useRef } from "react";
import { CheckIcon, DownloadIcon, FolderIcon, ImageIcon, TrashIcon } from "./icons";
import { endpoints } from "@/lib/client";
import { formatBytes, formatDate } from "@/lib/format";
import type { GalleryEntry, ViewMode } from "@/lib/types";

interface EntryItemProps {
  entry: GalleryEntry;
  view: ViewMode;
  readOnly: boolean;
  busy: boolean;
  /** Multi-select is active: tapping toggles selection instead of opening. */
  selectable: boolean;
  selected: boolean;
  onOpenFolder: (entry: GalleryEntry) => void;
  onPreview: (entry: GalleryEntry) => void;
  onRequestDelete: (entry: GalleryEntry) => void;
  onToggleSelect: (entry: GalleryEntry, modifiers?: SelectModifiers) => void;
}

export interface SelectModifiers {
  shift: boolean;
  meta: boolean;
}

const ACTIONS_VISIBLE =
  "opacity-100 transition [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 [@media(hover:hover)]:focus-within:opacity-100";

const LONG_PRESS_MS = 420;
const LONG_PRESS_SLACK = 12;

/** Hold-to-select on touch devices (mouse users get the toolbar control). */
function useLongPress(enabled: boolean, onLongPress: () => void) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Set when a hold fired, so the click that follows it is swallowed. */
  const consumed = useRef(false);
  const origin = useRef({ x: 0, y: 0 });

  const cancel = useCallback(() => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  }, []);

  useEffect(() => cancel, [cancel]);

  return {
    /** True (once) when the click is the tail of a completed hold. */
    consume: () => {
      if (!consumed.current) return false;
      consumed.current = false;
      return true;
    },
    bind: {
      onPointerDown: (event: React.PointerEvent) => {
        if (!enabled || event.pointerType === "mouse") return;
        origin.current = { x: event.clientX, y: event.clientY };
        cancel();
        timer.current = setTimeout(() => {
          timer.current = null;
          consumed.current = true;
          navigator.vibrate?.(12);
          onLongPress();
        }, LONG_PRESS_MS);
      },
      onPointerMove: (event: React.PointerEvent) => {
        if (!timer.current) return;
        const moved =
          Math.abs(event.clientX - origin.current.x) + Math.abs(event.clientY - origin.current.y);
        if (moved > LONG_PRESS_SLACK) cancel();
      },
      onPointerUp: cancel,
      onPointerCancel: () => {
        cancel();
        consumed.current = false;
      },
      onContextMenu: (event: React.MouseEvent) => {
        if (consumed.current) event.preventDefault();
      },
    },
  };
}

export default function EntryItem({
  entry,
  view,
  readOnly,
  busy,
  selectable,
  selected,
  onOpenFolder,
  onPreview,
  onRequestDelete,
  onToggleSelect,
}: EntryItemProps) {
  const isFolder = entry.kind === "folder";

  // A hold only starts a selection while selection is off; once it is on,
  // plain taps toggle.
  const hold = useLongPress(!selectable, () => onToggleSelect(entry));

  const activate = (modifiers?: SelectModifiers) => {
    if (hold.consume()) return;
    if (selectable || modifiers?.meta) {
      onToggleSelect(entry, modifiers);
    } else if (isFolder) {
      onOpenFolder(entry);
    } else {
      onPreview(entry);
    }
  };

  const badge = (
    <span
      aria-hidden="true"
      className={`grid h-6 w-6 place-items-center rounded-full border-2 transition ${
        selected
          ? "border-accent bg-accent text-white"
          : "border-white/80 bg-black/45 text-transparent backdrop-blur"
      }`}
    >
      <CheckIcon width={15} height={15} />
    </span>
  );

  const selectedRing = selected ? "ring-2 ring-accent ring-offset-2 ring-offset-surface-sunken" : "";

  const actions = (
    <div className={`flex items-center gap-0.5 ${ACTIONS_VISIBLE}`}>
      {!isFolder ? (
        <a
          href={endpoints.download(entry.token)}
          download={entry.name}
          onClick={(event) => event.stopPropagation()}
          aria-label={`Download ${entry.name}`}
          title="Download"
          className="grid h-9 w-9 place-items-center rounded-lg bg-black/45 text-white/90 backdrop-blur transition hover:bg-black/70 hover:text-white"
        >
          <DownloadIcon width={17} height={17} />
        </a>
      ) : null}
      {!readOnly ? (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onRequestDelete(entry);
          }}
          disabled={busy}
          aria-label={`Delete ${entry.name}`}
          title={isFolder ? "Delete folder" : "Delete image"}
          className="grid h-9 w-9 place-items-center rounded-lg bg-black/45 text-white/90 backdrop-blur transition hover:bg-danger hover:text-white disabled:opacity-40"
        >
          <TrashIcon width={17} height={17} />
        </button>
      ) : null}
    </div>
  );

  if (view === "list") {
    return (
      <li className="group relative">
        <button
          type="button"
          role={selectable ? "checkbox" : undefined}
          aria-checked={selectable ? selected : undefined}
          onClick={(event) =>
            activate({ shift: event.shiftKey, meta: event.ctrlKey || event.metaKey })
          }
          {...hold.bind}
          aria-label={
            selectable ? `Select ${entry.name}` : isFolder ? `Open folder ${entry.name}` : `Open image ${entry.name}`
          }
          className={`flex min-h-16 w-full items-center gap-3 rounded-xl border border-transparent px-2 py-2 text-left transition hover:border-line/60 hover:bg-surface-raised ${selectedRing}`}
        >
          {selectable ? <span className="shrink-0">{badge}</span> : null}
          <span className="relative grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-lg bg-surface-sunken ring-1 ring-line/50">
            {isFolder ? (
              entry.coverToken ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={endpoints.thumb(entry.coverToken, 128)}
                  alt=""
                  loading="lazy"
                  decoding="async"
                  className="h-full w-full object-cover opacity-80"
                />
              ) : (
                <FolderIcon className="text-accent" width={22} height={22} />
              )
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={endpoints.thumb(entry.token, 128)}
                alt=""
                loading="lazy"
                decoding="async"
                className="h-full w-full object-cover"
              />
            )}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium">{entry.name}</span>
            <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-ink-muted">
              {isFolder ? (
                <span className="inline-flex items-center gap-1">
                  <FolderIcon width={12} height={12} /> folder
                </span>
              ) : (
                <span className="inline-flex items-center gap-1">
                  <ImageIcon width={12} height={12} />
                  {(entry.extension ?? "image").replace(".", "").toUpperCase()}
                </span>
              )}
              <span>{formatDate(entry.modifiedAt)}</span>
              {!isFolder ? <span className="tabular-nums">{formatBytes(entry.sizeBytes)}</span> : null}
            </span>
          </span>
        </button>
        {selectable ? null : (
          <div className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 [&>*]:pointer-events-auto">
            {actions}
          </div>
        )}
      </li>
    );
  }

  return (
    <li className="group relative">
      <button
        type="button"
        role={selectable ? "checkbox" : undefined}
        aria-checked={selectable ? selected : undefined}
        onClick={(event) =>
          activate({ shift: event.shiftKey, meta: event.ctrlKey || event.metaKey })
        }
        {...hold.bind}
        aria-label={
          selectable ? `Select ${entry.name}` : isFolder ? `Open folder ${entry.name}` : `Open image ${entry.name}`
        }
        className={`block w-full overflow-hidden rounded-xl border border-line/50 bg-surface-raised transition hover:border-accent/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent ${selectedRing}`}
      >
        <span className="relative block aspect-square w-full overflow-hidden bg-surface-sunken">
          {isFolder ? (
            <>
              {entry.coverToken ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={endpoints.thumb(entry.coverToken, 400)}
                  alt=""
                  loading="lazy"
                  decoding="async"
                  className="absolute inset-0 h-full w-full object-cover opacity-45 transition duration-300 group-hover:scale-[1.03]"
                />
              ) : null}
              <span className="absolute inset-0 grid place-items-center">
                <FolderIcon className="text-accent drop-shadow-[0_2px_8px_rgba(0,0,0,0.8)]" width={40} height={40} />
              </span>
            </>
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={endpoints.thumb(entry.token, 400)}
              alt={entry.name}
              loading="lazy"
              decoding="async"
              className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]"
            />
          )}
          {selectable ? (
            <span className="absolute left-1.5 top-1.5 drop-shadow-[0_1px_4px_rgba(0,0,0,0.7)]">{badge}</span>
          ) : null}
          <span className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/25 to-transparent px-2 pb-1.5 pt-6 text-left">
            <span className="block truncate text-xs font-medium text-white/95">{entry.name}</span>
            <span className="block truncate text-[10px] uppercase tracking-wide text-white/60">
              {isFolder
                ? "folder"
                : `${(entry.extension ?? "").replace(".", "")} · ${formatDate(entry.modifiedAt)}`}
            </span>
          </span>
        </span>
      </button>
      {selectable ? null : <div className="absolute right-1.5 top-1.5">{actions}</div>}
    </li>
  );
}
