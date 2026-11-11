"use client";

import {
  CheckSquareIcon,
  ChevronUpIcon,
  GridIcon,
  ListIcon,
  SortAscIcon,
  SortDescIcon,
} from "./icons";
import type { FolderInfo, SortDir, SortKey, ViewMode } from "@/lib/types";

interface GalleryToolbarProps {
  folder: FolderInfo;
  counts: { folders: number; images: number };
  view: ViewMode;
  sort: SortKey;
  dir: SortDir;
  loading: boolean;
  /** Multi-select needs at least one entry and a writable volume. */
  canSelect: boolean;
  selectMode: boolean;
  onViewChange: (view: ViewMode) => void;
  onSortChange: (sort: SortKey) => void;
  onDirChange: (dir: SortDir) => void;
  onUp: () => void;
  onToggleSelectMode: () => void;
}

export default function GalleryToolbar({
  folder,
  counts,
  view,
  sort,
  dir,
  loading,
  canSelect,
  selectMode,
  onViewChange,
  onSortChange,
  onDirChange,
  onUp,
  onToggleSelectMode,
}: GalleryToolbarProps) {
  const dirLabel =
    sort === "name" ? (dir === "asc" ? "A → Z" : "Z → A") : dir === "asc" ? "Oldest first" : "Newest first";

  return (
    <section
      aria-label="Listing controls"
      className="flex flex-wrap items-center gap-2 rounded-2xl border border-line/50 bg-surface/70 p-2"
    >
      <button
        type="button"
        onClick={onUp}
        disabled={!folder.parentToken}
        aria-label="Go up one level"
        title="Up one level"
        className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-line/70 text-ink-muted transition hover:bg-surface-raised hover:text-ink disabled:opacity-30"
      >
        <ChevronUpIcon width={18} height={18} />
      </button>

      <div className="order-2 min-w-0 flex-1 sm:order-none">
        <p className="truncate text-sm font-semibold" title={folder.name}>
          {folder.name}
        </p>
        <p className="truncate text-xs text-ink-muted">
          {counts.folders} folder{counts.folders === 1 ? "" : "s"} · {counts.images} image
          {counts.images === 1 ? "" : "s"}
          {loading ? " · refreshing" : ""}
        </p>
      </div>

      <div className="order-3 flex basis-full items-center justify-between gap-2 sm:order-none sm:basis-auto sm:justify-start">
        <label className="sr-only" htmlFor="sort-by">
          Order by
        </label>
        <select
          id="sort-by"
          value={sort}
          onChange={(event) => onSortChange(event.target.value as SortKey)}
          className="h-10 rounded-xl border border-line/70 bg-surface px-2.5 text-sm text-ink outline-none transition hover:bg-surface-raised focus:border-accent"
        >
          <option value="name">Name</option>
          <option value="date">Date</option>
        </select>

        <button
          type="button"
          onClick={() => onDirChange(dir === "asc" ? "desc" : "asc")}
          aria-label={`Order direction: ${dirLabel}`}
          title={dirLabel}
          className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-line/70 px-2.5 text-sm text-ink-muted transition hover:bg-surface-raised hover:text-ink"
        >
          {dir === "asc" ? <SortAscIcon width={18} height={18} /> : <SortDescIcon width={18} height={18} />}
          <span className="hidden sm:inline">{dirLabel}</span>
        </button>

        <div
          role="group"
          aria-label="Layout"
          className="flex items-center gap-0.5 rounded-xl border border-line/70 p-0.5"
        >
          <button
            type="button"
            onClick={() => onViewChange("grid")}
            aria-pressed={view === "grid"}
            aria-label="Grid view"
            title="Grid view"
            className={`grid h-9 w-9 place-items-center rounded-lg transition ${
              view === "grid" ? "bg-accent-strong text-white" : "text-ink-muted hover:text-ink"
            }`}
          >
            <GridIcon width={18} height={18} />
          </button>
          <button
            type="button"
            onClick={() => onViewChange("list")}
            aria-pressed={view === "list"}
            aria-label="List view"
            title="List view"
            className={`grid h-9 w-9 place-items-center rounded-lg transition ${
              view === "list" ? "bg-accent-strong text-white" : "text-ink-muted hover:text-ink"
            }`}
          >
            <ListIcon width={18} height={18} />
          </button>
        </div>

        {canSelect ? (
          <button
            type="button"
            onClick={onToggleSelectMode}
            aria-pressed={selectMode}
            aria-label={selectMode ? "Exit selection" : "Select multiple items"}
            title={selectMode ? "Exit selection (Esc)" : "Select multiple items"}
            className={`inline-flex h-10 items-center gap-1.5 rounded-xl border px-2.5 text-sm transition ${
              selectMode
                ? "border-accent bg-accent-strong text-white"
                : "border-line/70 text-ink-muted hover:bg-surface-raised hover:text-ink"
            }`}
          >
            <CheckSquareIcon width={18} height={18} />
            <span className="hidden sm:inline">{selectMode ? "Done" : "Select"}</span>
          </button>
        ) : null}
      </div>
    </section>
  );
}
