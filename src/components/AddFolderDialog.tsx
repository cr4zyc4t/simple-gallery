"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  CloseIcon,
  FolderIcon,
  FolderPlusIcon,
  HomeIcon,
  SpinnerIcon,
} from "./icons";
import { addLibraryFolder, fetchBrowse } from "@/lib/client";
import type { BrowseResponse, LibraryFolder } from "@/lib/types";

interface AddFolderDialogProps {
  open: boolean;
  onClose: () => void;
  onAdded: (folder: LibraryFolder, openFolder: boolean) => void;
}

type Tab = "browse" | "path";

export default function AddFolderDialog({ open, onClose, onAdded }: AddFolderDialogProps) {
  const [tab, setTab] = useState<Tab>("browse");
  const [token, setToken] = useState<string | null>(null);
  const [data, setData] = useState<BrowseResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [typedPath, setTypedPath] = useState("");

  const load = useCallback(async (nextToken: string | null) => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetchBrowse(nextToken);
      setData(response);
      setToken(nextToken);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not read this folder");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    setTab("browse");
    setTypedPath("");
    void load(null);
  }, [open, load]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const submit = async (payload: { path?: string; token?: string }, openFolder: boolean) => {
    setBusy(true);
    setError(null);
    try {
      const result = await addLibraryFolder(payload);
      onAdded(result.folder, openFolder);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Could not add this folder — check the path and the allowed roots",
      );
    } finally {
      setBusy(false);
    }
  };

  if (!open) return null;

  const current = data?.current ?? null;
  const roots = data?.roots ?? [];

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 backdrop-blur-sm sm:items-center sm:p-6"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-folder-title"
        className="animate-pop-in flex max-h-[92dvh] w-full max-w-2xl flex-col overflow-hidden rounded-t-3xl border border-line/70 bg-surface-raised shadow-2xl sm:rounded-2xl"
      >
        <header className="flex items-center justify-between gap-3 border-b border-line/60 px-4 py-3 sm:px-5">
          <h2 id="add-folder-title" className="text-base font-semibold sm:text-lg">
            Add a folder
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="-m-1 rounded-full p-2 text-ink-muted transition hover:bg-surface hover:text-ink"
          >
            <CloseIcon />
          </button>
        </header>

        <div className="grid grid-cols-2 gap-1 border-b border-line/60 p-2">
          {(["browse", "path"] as const).map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setTab(option)}
              aria-pressed={tab === option}
              className={`h-10 rounded-xl text-sm font-medium transition ${
                tab === option
                  ? "bg-accent-strong text-white"
                  : "text-ink-muted hover:bg-surface hover:text-ink"
              }`}
            >
              {option === "browse" ? "Browse server" : "Type a path"}
            </button>
          ))}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3 sm:px-5">
          {tab === "path" ? (
            <form
              className="space-y-3 py-2"
              onSubmit={(event) => {
                event.preventDefault();
                if (!typedPath.trim() || busy) return;
                void submit({ path: typedPath }, true);
              }}
            >
              <label htmlFor="folder-path" className="block text-sm text-ink-muted">
                Folder path on the server
              </label>
              <input
                id="folder-path"
                type="text"
                value={typedPath}
                onChange={(event) => setTypedPath(event.target.value)}
                placeholder="/data/photos/2024 or .. /vacation (relative to the gallery root)"
                autoComplete="off"
                spellCheck={false}
                autoFocus
                className="h-12 w-full rounded-xl border border-line bg-surface px-3 font-mono text-sm outline-none placeholder:text-ink-muted/60 focus:border-accent"
              />
              <p className="text-xs leading-relaxed text-ink-muted">
                Relative paths are resolved from the gallery root. The folder must exist and live
                inside a directory the server exposes (see <code>GALLERY_ALLOWED_ROOTS</code>).
              </p>
              <div className="flex flex-col gap-2 pt-1 sm:flex-row">
                <button
                  type="submit"
                  disabled={busy || !typedPath.trim()}
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-accent-strong px-4 font-semibold text-white transition hover:bg-accent disabled:opacity-50"
                >
                  {busy ? <SpinnerIcon width={18} height={18} /> : <FolderPlusIcon width={18} height={18} />}
                  Add &amp; open
                </button>
                <button
                  type="button"
                  disabled={busy || !typedPath.trim()}
                  onClick={() => void submit({ path: typedPath }, false)}
                  className="h-11 rounded-xl border border-line px-4 font-medium text-ink-muted transition hover:bg-surface hover:text-ink disabled:opacity-50"
                >
                  Add only
                </button>
              </div>
            </form>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center gap-2 pb-1">
                <button
                  type="button"
                  onClick={() => void load(current?.parentToken ?? null)}
                  disabled={loading || (!current && roots.length === 0)}
                  className="inline-flex h-10 items-center gap-1 rounded-xl border border-line px-3 text-sm text-ink-muted transition hover:bg-surface hover:text-ink disabled:opacity-40"
                >
                  <ChevronLeftIcon width={18} height={18} />
                  <span className="hidden sm:inline">Up</span>
                </button>
                <button
                  type="button"
                  onClick={() => void load(null)}
                  className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-line px-3 text-sm text-ink-muted transition hover:bg-surface hover:text-ink"
                >
                  <HomeIcon width={18} height={18} />
                  <span className="hidden sm:inline">Allowed roots</span>
                </button>
                <span className="min-w-0 flex-1 truncate text-right font-mono text-xs text-ink-muted">
                  {current ? current.name : "choose a starting point"}
                </span>
              </div>

              {loading ? (
                <div className="flex items-center gap-2 py-8 text-sm text-ink-muted">
                  <SpinnerIcon /> Reading folder…
                </div>
              ) : current && data && data.entries.length === 0 ? (
                <p className="py-8 text-center text-sm text-ink-muted">
                  No sub-folders here — you can still add this folder.
                </p>
              ) : null}

              {!current && !loading ? (
                <p className="pb-1 text-xs text-ink-muted">
                  Exposed roots — open one to drill down, or add it directly.
                </p>
              ) : null}

              <ul className="divide-y divide-line/40">
                {(current ? data?.entries ?? [] : roots.map((root) => ({ ...root, hasChildren: true }))).map(
                  (entry) => (
                    <li key={entry.token} className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => void load(entry.token)}
                        className="flex min-h-12 min-w-0 flex-1 items-center gap-2 rounded-lg px-2 py-2 text-left text-sm transition hover:bg-surface"
                      >
                        <FolderIcon className="shrink-0 text-accent" width={18} height={18} />
                        <span className="truncate">{entry.name}</span>
                        {entry.hasChildren ? (
                          <ChevronRightIcon className="ml-auto shrink-0 text-ink-muted/60" width={16} height={16} />
                        ) : null}
                      </button>
                      <button
                        type="button"
                        onClick={() => void submit({ token: entry.token }, true)}
                        disabled={busy}
                        title="Add this folder"
                        aria-label={`Add ${entry.name} to the library`}
                        className="grid h-11 w-11 shrink-0 place-items-center rounded-lg text-ink-muted transition hover:bg-surface hover:text-accent disabled:opacity-40"
                      >
                        <FolderPlusIcon width={18} height={18} />
                      </button>
                    </li>
                  ),
                )}
              </ul>
            </div>
          )}

          {error ? (
            <p className="mt-3 rounded-xl border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
              {error}
            </p>
          ) : null}
        </div>

        {tab === "browse" ? (
          <footer className="flex flex-col gap-2 border-t border-line/60 px-4 py-3 sm:flex-row sm:items-center sm:px-5">
            <span className="min-w-0 flex-1 truncate text-xs text-ink-muted">
              {current ? `Adding: ${current.name}` : "Open a folder first"}
            </span>
            <button
              type="button"
              disabled={!current || busy}
              onClick={() => current && void submit({ token: current.token }, true)}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-accent-strong px-4 font-semibold text-white transition hover:bg-accent disabled:opacity-40"
            >
              {busy ? <SpinnerIcon width={18} height={18} /> : <FolderPlusIcon width={18} height={18} />}
              Add &amp; open this folder
            </button>
          </footer>
        ) : null}
      </div>
    </div>
  );
}
