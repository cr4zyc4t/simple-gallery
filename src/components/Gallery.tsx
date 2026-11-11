"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import AddFolderDialog from "./AddFolderDialog";
import ConfirmDialog from "./ConfirmDialog";
import EntryItem from "./EntryItem";
import GalleryToolbar from "./GalleryToolbar";
import LibraryPanel from "./LibraryPanel";
import Lightbox from "./Lightbox";
import {
  AlertIcon,
  CloseIcon,
  FolderPlusIcon,
  HomeIcon,
  MenuIcon,
  RefreshIcon,
  SpinnerIcon,
  TrashIcon,
} from "./icons";
import { deleteEntries, deleteEntry, fetchEntryStats, fetchLibrary, fetchListing, removeLibraryFolder } from "@/lib/client";
import { DEFAULT_PREFS, type Prefs } from "@/lib/prefs";
import { usePrefs } from "@/lib/use-prefs";
import type {
  FolderInfo,
  GalleryEntry,
  LibraryFolder,
  ListingResponse,
} from "@/lib/types";

type Pending =
  | { type: "image"; entry: GalleryEntry }
  | { type: "folder"; entry: GalleryEntry; folders: number; images: number; other: number }
  | { type: "batch"; entries: GalleryEntry[]; folders: number; images: number }
  | null;

interface SelectionModifiers {
  shift: boolean;
  meta: boolean;
}

interface GalleryProps {
  initialListing: ListingResponse;
  initialLibrary: LibraryFolder[];
  /** Ordering/layout the server already rendered with. */
  initialPrefs?: Prefs;
}

export default function Gallery({
  initialListing,
  initialLibrary,
  initialPrefs = DEFAULT_PREFS,
}: GalleryProps) {
  const [listing, setListing] = useState<ListingResponse>(initialListing);
  const [library, setLibrary] = useState<LibraryFolder[]>(initialLibrary);
  const [token, setToken] = useState<string | null>(initialListing.folder.token || null);
  const [loading, setLoading] = useState(false);
  const [libraryLoading, setLibraryLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; tone: "ok" | "error" } | null>(null);

  // Seeded from the cookie, so the server HTML and this render agree.
  const [prefs, setPrefs] = usePrefs(initialPrefs);
  const { view, sort, dir } = prefs;

  const [previewIndex, setPreviewIndex] = useState<number | null>(null);
  const [pending, setPending] = useState<Pending>(null);
  const [busy, setBusy] = useState(false);
  const [deletingToken, setDeletingToken] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Multi-select lives in memory only — it is meaningless in another folder.
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const selectionAnchor = useRef<number | null>(null);

  const readOnly = listing.readOnly;
  const requestId = useRef(0);

  const images = useMemo(
    () => listing.entries.filter((entry): entry is GalleryEntry => entry.kind === "image"),
    [listing.entries],
  );

  const notify = useCallback((message: string, tone: "ok" | "error" = "ok") => {
    setToast({ message, tone });
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(timer);
  }, [toast]);

  const loadLibrary = useCallback(async () => {
    setLibraryLoading(true);
    try {
      const data = await fetchLibrary();
      setLibrary(data.folders);
    } catch (requestError) {
      notify(
        requestError instanceof Error ? requestError.message : "Could not load the library",
        "error",
      );
    } finally {
      setLibraryLoading(false);
    }
  }, [notify]);

  // Listing is re-fetched when the folder or the ordering changes (the server
  // owns collation so both views stay consistent). The very first fetch is
  // skipped when the server already rendered exactly this listing.
  const served = useRef({
    token: initialListing.folder.token || null,
    sort: initialPrefs.sort,
    dir: initialPrefs.dir,
  });
  const skipFirstFetch = useRef(true);

  useEffect(() => {
    if (skipFirstFetch.current) {
      skipFirstFetch.current = false;
      if (token === served.current.token && sort === served.current.sort && dir === served.current.dir) {
        return;
      }
    }
    let cancelled = false;
    const id = ++requestId.current;
    setLoading(true);
    setError(null);
    fetchListing(token, sort, dir)
      .then((data) => {
        if (cancelled || id !== requestId.current) return;
        setListing(data);
        setToken(data.folder.token || null);
        setPreviewIndex(null);
      })
      .catch((requestError: unknown) => {
        if (cancelled || id !== requestId.current) return;
        setError(requestError instanceof Error ? requestError.message : "Could not read this folder");
      })
      .finally(() => {
        if (!cancelled && id === requestId.current) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token, sort, dir]);

  const goTo = useCallback((nextToken: string | null) => {
    setDrawerOpen(false);
    setPreviewIndex(null);
    setToken(nextToken);
  }, []);

  /** Leaving a folder always drops the selection. */
  useEffect(() => {
    setSelected([]);
    setSelectMode(false);
    selectionAnchor.current = null;
  }, [token]);

  const selectedEntries = useMemo(() => {
    const chosen = new Set(selected);
    return listing.entries.filter((entry) => chosen.has(entry.token));
  }, [listing.entries, selected]);

  const selectionCount = selectedEntries.length;
  const selectedCounts = useMemo(
    () => ({
      folders: selectedEntries.filter((entry) => entry.kind === "folder").length,
      images: selectedEntries.filter((entry) => entry.kind === "image").length,
    }),
    [selectedEntries],
  );

  const exitSelectMode = useCallback(() => {
    setSelectMode(false);
    setSelected([]);
    selectionAnchor.current = null;
  }, []);

  const toggleSelect = useCallback(
    (entry: GalleryEntry, position: number, modifiers?: SelectionModifiers) => {
      setSelectMode(true);
      setSelected((current) => {
        // Shift extends the previous pick, like a file manager.
        const anchor = selectionAnchor.current;
        if (modifiers?.shift && anchor !== null && position >= 0) {
          const merged = new Set(current);
          for (let index = Math.min(anchor, position); index <= Math.max(anchor, position); index += 1) {
            const item = listing.entries[index];
            if (item) merged.add(item.token);
          }
          return [...merged];
        }
        return current.includes(entry.token)
          ? current.filter((token) => token !== entry.token)
          : [...current, entry.token];
      });
      if (position >= 0) selectionAnchor.current = position;
    },
    [listing.entries],
  );

  const selectEverything = useCallback(() => {
    setSelectMode(true);
    setSelected(listing.entries.map((entry) => entry.token));
  }, [listing.entries]);

  const clearSelection = useCallback(() => {
    setSelected([]);
    selectionAnchor.current = null;
  }, []);

  const refresh = useCallback(async () => {
    const data = await fetchListing(token, sort, dir).catch((requestError: unknown) => {
      setError(requestError instanceof Error ? requestError.message : "Could not refresh");
      return null;
    });
    if (data) setListing(data);
    void loadLibrary();
  }, [dir, loadLibrary, sort, token]);

  /** Drop deleted items from the listing without refetching. */
  const removeLocalEntries = useCallback((tokens: Set<string>) => {
    setListing((current) => {
      const remaining = current.entries.filter((item) => !tokens.has(item.token));
      return {
        ...current,
        entries: remaining,
        counts: {
          folders: remaining.filter((item) => item.kind === "folder").length,
          images: remaining.filter((item) => item.kind === "image").length,
        },
      };
    });
  }, []);

  /** Delete through the API, then patch local state (no refetch needed). */
  const performDelete = useCallback(
    async (entry: GalleryEntry): Promise<boolean> => {
      setDeletingToken(entry.token);
      try {
        await deleteEntry(entry.token, entry.kind);
        removeLocalEntries(new Set([entry.token]));
        const walkedIntoDeleted =
          entry.kind === "folder" &&
          (listing.folder.trail.some((step) => step.token === entry.token) ||
            listing.folder.token === entry.token);
        if (walkedIntoDeleted) goTo(listing.folder.parentToken);
        void loadLibrary();
        return true;
      } catch (requestError) {
        notify(requestError instanceof Error ? requestError.message : "Delete failed", "error");
        return false;
      } finally {
        setDeletingToken(null);
      }
    },
    [goTo, listing.folder, loadLibrary, notify, removeLocalEntries],
  );

  /** Ask before deleting: images always, folders only when not empty. */
  const requestDelete = useCallback(
    async (entry: GalleryEntry) => {
      if (entry.kind === "image") {
        setPending({ type: "image", entry });
        return;
      }
      setBusy(true);
      try {
        const stats = await fetchEntryStats(entry.token);
        if (stats.kind !== "folder") throw new Error("This is not a folder");
        if (stats.empty) {
          const ok = await performDelete(entry);
          if (ok) notify(`Deleted empty folder “${entry.name}”`);
        } else {
          setPending({
            type: "folder",
            entry,
            folders: stats.counts.folders,
            images: stats.counts.images,
            other: stats.counts.other,
          });
        }
      } catch (requestError) {
        notify(
          requestError instanceof Error ? requestError.message : "Could not inspect this folder",
          "error",
        );
      } finally {
        setBusy(false);
      }
    },
    [notify, performDelete],
  );

  const confirmPending = useCallback(async () => {
    if (!pending) return;

    if (pending.type === "batch") {
      const tokens = pending.entries.map((entry) => entry.token);
      setBusy(true);
      try {
        const result = await deleteEntries(tokens);
        const failed = new Set(result.results.filter((item) => !item.ok).map((item) => item.token));
        const removed = new Set(tokens.filter((token) => !failed.has(token)));
        removeLocalEntries(removed);
        setSelected((current) => current.filter((token) => !removed.has(token)));
        void loadLibrary();
        if (failed.size > 0) {
          const reason = result.results.find((item) => !item.ok)?.error ?? "some items were protected";
          notify(`Deleted ${result.deletedCount} of ${result.requested} — ${reason}`, "error");
        } else {
          notify(`Deleted ${result.deletedCount} item${result.deletedCount === 1 ? "" : "s"}`);
          exitSelectMode();
        }
      } catch (requestError) {
        notify(requestError instanceof Error ? requestError.message : "Delete failed", "error");
      } finally {
        setBusy(false);
        setPending(null);
      }
      return;
    }

    const entry = pending.entry;
    const wasPreviewing = previewIndex !== null && images[previewIndex]?.token === entry.token;
    const ok = await performDelete(entry);
    setPending(null);
    if (!ok) return;
    if (wasPreviewing) {
      setPreviewIndex((current) => {
        if (current === null) return null;
        const nextImages = images.filter((item) => item.token !== entry.token);
        if (nextImages.length === 0) return null;
        return Math.min(current, nextImages.length - 1);
      });
    }
    notify(`Deleted “${entry.name}”`);
  }, [exitSelectMode, images, loadLibrary, notify, pending, performDelete, previewIndex, removeLocalEntries]);

  const handleFolderAdded = useCallback(
    (folder: LibraryFolder, openFolder: boolean) => {
      setAddOpen(false);
      setLibrary((current) =>
        current.some((item) => item.id === folder.id) ? current : [...current, folder],
      );
      void loadLibrary();
      if (openFolder) goTo(folder.token);
      notify(`Added “${folder.name}” to the library`);
    },
    [goTo, loadLibrary, notify],
  );

  const removeLibrary = useCallback(
    async (folder: LibraryFolder) => {
      try {
        await removeLibraryFolder(folder.id);
        setLibrary((current) => current.filter((item) => item.id !== folder.id));
        notify(`Removed “${folder.name}” from the library`);
      } catch (requestError) {
        notify(
          requestError instanceof Error ? requestError.message : "Could not remove the folder",
          "error",
        );
      }
    },
    [notify],
  );

  const requestBatchDelete = useCallback(() => {
    if (selectedEntries.length === 0) return;
    setPending({
      type: "batch",
      entries: selectedEntries,
      folders: selectedCounts.folders,
      images: selectedCounts.images,
    });
  }, [selectedCounts.folders, selectedCounts.images, selectedEntries]);

  // Esc leaves selection mode, Delete confirms a batch (the lightbox has its own keys).
  useEffect(() => {
    if (!selectMode) return;
    const onKey = (event: KeyboardEvent) => {
      if (previewIndex !== null || pending || addOpen || drawerOpen) return;
      if (event.key === "Escape") {
        event.preventDefault();
        exitSelectMode();
      } else if ((event.key === "Delete" || event.key === "Backspace") && selectionCount > 0) {
        event.preventDefault();
        requestBatchDelete();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [
    addOpen,
    drawerOpen,
    exitSelectMode,
    pending,
    previewIndex,
    requestBatchDelete,
    selectMode,
    selectionCount,
  ]);

  const folder: FolderInfo = listing.folder;

  const previewEntry = previewIndex !== null ? images[previewIndex] : undefined;
  useEffect(() => {
    if (previewIndex === null || previewEntry) return;
    setPreviewIndex(null);
  }, [previewEntry, previewIndex]);

  const libraryPanel = (
    <LibraryPanel
      folders={library}
      loading={libraryLoading}
      activeToken={token}
      onOpen={goTo}
      onRemove={(folderToRemove) => void removeLibrary(folderToRemove)}
      onAdd={() => setAddOpen(true)}
    />
  );

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-30 border-b border-line/60 bg-surface-sunken/95 backdrop-blur">
        <div className="mx-auto flex w-full max-w-[1800px] items-center gap-2 px-3 py-2 sm:px-4 sm:py-3">
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            aria-label="Open library"
            className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-line/70 text-ink-muted transition hover:bg-surface hover:text-ink lg:hidden"
          >
            <MenuIcon />
          </button>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-accent-strong/25 text-accent">
                <HomeIcon width={16} height={16} />
              </span>
              <h1 className="truncate text-base font-semibold tracking-tight sm:text-lg">
                Simple Gallery
              </h1>
            </div>
            <nav
              aria-label="Breadcrumb"
              className="no-scrollbar mt-0.5 flex items-center gap-1 overflow-x-auto text-xs text-ink-muted"
            >
              <button
                type="button"
                onClick={() => goTo(null)}
                className="shrink-0 rounded px-1 py-0.5 hover:text-ink"
                title="Default gallery folder"
              >
                Home
              </button>
              {folder.trail.map((step, position, array) => (
                <span key={step.token} className="flex shrink-0 items-center gap-1">
                  <span className="text-ink-muted/50">/</span>
                  <button
                    type="button"
                    onClick={() => goTo(step.token)}
                    className={`max-w-[45vw] truncate rounded px-1 py-0.5 hover:text-ink ${
                      position === array.length - 1 ? "text-ink" : ""
                    }`}
                  >
                    {step.name}
                  </button>
                </span>
              ))}
            </nav>
          </div>
          <button
            type="button"
            onClick={() => void refresh()}
            aria-label="Refresh"
            className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-line/70 text-ink-muted transition hover:bg-surface hover:text-ink"
          >
            <RefreshIcon className={loading ? "animate-spin" : undefined} />
          </button>
          <button
            type="button"
            onClick={() => setAddOpen(true)}
            aria-label="Add folder to library"
            className="inline-flex h-11 shrink-0 items-center gap-2 rounded-xl bg-accent-strong px-3 text-sm font-semibold text-white transition hover:bg-accent sm:px-4"
          >
            <FolderPlusIcon width={18} height={18} />
            <span className="hidden sm:inline">Add folder</span>
          </button>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-[1800px] flex-1 gap-4 px-3 py-3 sm:px-4 sm:py-4">
        <aside className="hidden w-64 shrink-0 lg:block xl:w-72">
          <div className="sticky top-[104px] max-h-[calc(100dvh-124px)] overflow-hidden rounded-2xl border border-line/60 bg-surface p-3">
            {libraryPanel}
          </div>
        </aside>

        <main className={`min-w-0 flex-1${selectMode ? " pb-24" : ""}`}>
          <GalleryToolbar
            folder={folder}
            counts={listing.counts}
            view={view}
            sort={sort}
            dir={dir}
            loading={loading}
            canSelect={!readOnly && listing.entries.length > 0}
            selectMode={selectMode}
            onViewChange={(next) => setPrefs({ view: next })}
            onSortChange={(next) => setPrefs({ sort: next })}
            onDirChange={(next) => setPrefs({ dir: next })}
            onUp={() => goTo(folder.parentToken)}
            onToggleSelectMode={() => (selectMode ? exitSelectMode() : setSelectMode(true))}
          />

          {error ? (
            <div className="mt-4 flex items-start gap-3 rounded-2xl border border-danger/40 bg-danger/10 p-4 text-sm">
              <AlertIcon className="mt-0.5 shrink-0 text-danger" />
              <div className="min-w-0 flex-1">
                <p className="font-medium text-danger">{error}</p>
                <p className="mt-1 text-ink-muted">
                  The folder may have been removed or is outside the allowed roots.
                </p>
              </div>
              <button
                type="button"
                onClick={() => goTo(null)}
                className="shrink-0 rounded-lg border border-line px-3 py-1.5 text-xs font-medium text-ink-muted hover:text-ink"
              >
                Go to root
              </button>
            </div>
          ) : null}

          <div className="relative mt-3">
            {loading ? (
              <div className="pointer-events-none absolute right-2 top-0 z-10 flex items-center gap-1.5 rounded-full bg-surface-raised/90 px-3 py-1 text-xs text-ink-muted">
                <SpinnerIcon width={14} height={14} /> loading
              </div>
            ) : null}

            {listing.entries.length === 0 && !loading ? (
              <div className="mt-6 rounded-2xl border border-dashed border-line px-6 py-14 text-center">
                <p className="text-base font-medium">Nothing to show here</p>
                <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-ink-muted">
                  This folder has no sub-folders or images yet. Images placed on the server show up
                  automatically — add another folder from the library, or drop files into the
                  gallery directory.
                </p>
                <button
                  type="button"
                  onClick={() => setAddOpen(true)}
                  className="mt-5 inline-flex h-11 items-center gap-2 rounded-xl bg-accent-strong px-4 text-sm font-semibold text-white hover:bg-accent"
                >
                  <FolderPlusIcon width={18} height={18} /> Add a folder
                </button>
              </div>
            ) : listing.entries.length === 0 ? (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7">
                {Array.from({ length: 12 }).map((_, index) => (
                  <div
                    key={index}
                    className="aspect-square animate-pulse rounded-xl border border-line/40 bg-surface-raised/60"
                  />
                ))}
              </div>
            ) : view === "grid" ? (
              <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-2.5 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-8">
                {listing.entries.map((entry, position) => (
                  <EntryItem
                    key={entry.token}
                    entry={entry}
                    view="grid"
                    readOnly={readOnly}
                    busy={deletingToken === entry.token}
                    selectable={selectMode && !readOnly}
                    selected={selected.includes(entry.token)}
                    onOpenFolder={(item) => goTo(item.token)}
                    onPreview={(item) => {
                      const index = images.findIndex((image) => image.token === item.token);
                      if (index >= 0) setPreviewIndex(index);
                    }}
                    onRequestDelete={(item) => void requestDelete(item)}
                    onToggleSelect={(item, modifiers) => toggleSelect(item, position, modifiers)}
                  />
                ))}
              </ul>
            ) : (
              <ul className="divide-y divide-line/40 rounded-2xl border border-line/50 bg-surface/60 px-1 py-1">
                {listing.entries.map((entry, position) => (
                  <EntryItem
                    key={entry.token}
                    entry={entry}
                    view="list"
                    readOnly={readOnly}
                    busy={deletingToken === entry.token}
                    selectable={selectMode && !readOnly}
                    selected={selected.includes(entry.token)}
                    onOpenFolder={(item) => goTo(item.token)}
                    onPreview={(item) => {
                      const index = images.findIndex((image) => image.token === item.token);
                      if (index >= 0) setPreviewIndex(index);
                    }}
                    onRequestDelete={(item) => void requestDelete(item)}
                    onToggleSelect={(item, modifiers) => toggleSelect(item, position, modifiers)}
                  />
                ))}
              </ul>
            )}
          </div>

          <p className="mt-4 px-1 pb-2 text-center text-xs text-ink-muted/70">
            {readOnly
              ? "Read-only mode — deleting is disabled."
              : selectMode
                ? "Tap to select · hold to start selecting · Shift+click picks a range · Esc cancels."
                : "Folders are listed first."}
          </p>
        </main>
      </div>

      {/* Mobile / tablet library drawer */}
      {drawerOpen ? (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Library">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-fade-in"
            onClick={() => setDrawerOpen(false)}
          />
          <div className="animate-drawer-in absolute inset-y-0 left-0 flex w-[85%] max-w-xs flex-col border-r border-line/60 bg-surface p-3 shadow-2xl">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm font-semibold">Library</span>
              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                aria-label="Close library"
                className="grid h-10 w-10 place-items-center rounded-lg text-ink-muted hover:bg-surface-raised hover:text-ink"
              >
                <CloseIcon />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-hidden">{libraryPanel}</div>
          </div>
        </div>
      ) : null}

      <AddFolderDialog
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onAdded={(folderAdded, openFolder) => handleFolderAdded(folderAdded, openFolder)}
      />

      {previewEntry ? (
        <Lightbox
          images={images}
          index={previewIndex ?? 0}
          readOnly={readOnly}
          deleting={deletingToken === previewEntry.token}
          onIndexChange={setPreviewIndex}
          onClose={() => setPreviewIndex(null)}
          onRequestDelete={(entry) => void requestDelete(entry)}
        />
      ) : null}

      <ConfirmDialog
        open={pending !== null}
        tone="danger"
        busy={busy}
        title={
          pending?.type === "batch"
            ? `Delete ${pending.entries.length} item${pending.entries.length === 1 ? "" : "s"}?`
            : pending?.type === "folder"
              ? "Delete this folder?"
              : "Delete this image?"
        }
        confirmLabel={pending?.type === "batch" ? "Delete selected" : pending?.type === "folder" ? "Delete folder" : "Delete image"}
        cancelLabel={pending?.type === "batch" ? "Keep them" : "Keep it"}
        description={
          pending?.type === "batch" ? (
            <>
              <p>
                {pending.folders > 0 ? `${pending.folders} folder${pending.folders === 1 ? "" : "s"}` : ""}
                {pending.folders > 0 && pending.images > 0 ? " and " : ""}
                {pending.images > 0 ? `${pending.images} image${pending.images === 1 ? "" : "s"}` : ""}
                {pending.folders === 0 && pending.images === 0 ? "The selected items" : ""} will be
                permanently deleted from disk.
              </p>
              {pending.folders > 0 ? (
                <p>Everything inside the selected folders goes with them.</p>
              ) : null}
              <p className="text-danger">This cannot be undone.</p>
            </>
          ) : pending?.type === "folder" ? (
            (() => {
              const parts = [
                pending.folders > 0 ? `${pending.folders} folder${pending.folders === 1 ? "" : "s"}` : null,
                pending.images > 0 ? `${pending.images} image${pending.images === 1 ? "" : "s"}` : null,
                pending.other > 0 ? `${pending.other} other file${pending.other === 1 ? "" : "s"}` : null,
              ].filter(Boolean);
              return (
                <>
                  <p>
                    <span className="font-medium text-ink">{pending.entry.name}</span> still contains{" "}
                    {parts.join(", ")}.
                  </p>
                  <p className="text-danger">
                    Everything inside is permanently removed from disk. This cannot be undone.
                  </p>
                </>
              );
            })()
          ) : pending ? (
            <>
              <p>
                <span className="font-medium text-ink">{pending.entry.name}</span> will be
                permanently deleted from disk.
              </p>
              <p className="text-danger">This cannot be undone.</p>
            </>
          ) : null
        }
        onCancel={() => setPending(null)}
        onConfirm={() => void confirmPending()}
      />

      {selectMode && !readOnly ? (
        <div className="animate-pop-in fixed inset-x-0 bottom-0 z-40 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <div className="mx-auto flex w-fit max-w-full items-center gap-1 rounded-2xl border border-line/70 bg-surface-raised/95 p-1.5 text-sm shadow-2xl backdrop-blur">
            <span className="px-2 tabular-nums text-ink-muted" aria-live="polite">
              <span className="font-semibold text-ink">{selectionCount}</span> selected
            </span>
            <button
              type="button"
              onClick={selectionCount === listing.entries.length ? clearSelection : selectEverything}
              className="h-9 shrink-0 rounded-xl px-2.5 text-ink-muted transition hover:bg-surface hover:text-ink"
            >
              {selectionCount === listing.entries.length ? "None" : "All"}
            </button>
            <button
              type="button"
              onClick={requestBatchDelete}
              disabled={selectionCount === 0 || busy}
              className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-xl bg-danger px-3 font-semibold text-white transition hover:bg-danger/90 disabled:opacity-40"
            >
              <TrashIcon width={16} height={16} />
              Delete
            </button>
            <button
              type="button"
              onClick={exitSelectMode}
              aria-label="Exit selection"
              className="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-ink-muted transition hover:bg-surface hover:text-ink"
            >
              <CloseIcon width={18} height={18} />
            </button>
          </div>
        </div>
      ) : null}

      {toast ? (
        <div
          role="status"
          className={`animate-pop-in pointer-events-none fixed inset-x-0 z-[60] mx-auto w-fit max-w-[92vw] rounded-full px-4 py-2.5 text-sm shadow-xl ${
            toast.tone === "error"
              ? "bg-danger text-white"
              : "border border-line/60 bg-surface-raised text-ink"
          }`}
          style={{ bottom: selectMode && !readOnly ? "5.25rem" : "1.25rem" }}
        >
          <span className="flex items-center gap-2">
            {toast.tone === "error" ? <AlertIcon width={16} height={16} /> : null}
            <span className="truncate">{toast.message}</span>
            <button
              type="button"
              onClick={() => setToast(null)}
              aria-label="Dismiss"
              className="pointer-events-auto -mr-1 grid h-6 w-6 shrink-0 place-items-center rounded-full hover:bg-black/20"
            >
              <CloseIcon width={14} height={14} />
            </button>
          </span>
        </div>
      ) : null}
    </div>
  );
}
