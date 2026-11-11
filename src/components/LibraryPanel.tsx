"use client";

import { CloseIcon, FolderIcon, FolderPlusIcon, HomeIcon } from "./icons";
import type { LibraryFolder } from "@/lib/types";

interface LibraryPanelProps {
  folders: LibraryFolder[];
  loading: boolean;
  activeToken: string | null;
  onOpen: (token: string) => void;
  onRemove: (folder: LibraryFolder) => void;
  onAdd: () => void;
}

export default function LibraryPanel({
  folders,
  loading,
  activeToken,
  onOpen,
  onRemove,
  onAdd,
}: LibraryPanelProps) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between gap-2 px-1 pb-2">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-ink-muted">Library</h2>
        <span className="text-xs text-ink-muted/70">{folders.length}</span>
      </div>

      <button
        type="button"
        onClick={onAdd}
        className="mb-3 inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-accent-strong px-3 text-sm font-semibold text-white transition hover:bg-accent"
      >
        <FolderPlusIcon width={18} height={18} />
        Add folder
      </button>

      <nav className="-mx-1 min-h-0 flex-1 overflow-y-auto px-1">
        {loading && folders.length === 0 ? (
          <p className="px-1 py-2 text-sm text-ink-muted">Loading library…</p>
        ) : null}
        {!loading && folders.length === 0 ? (
          <p className="px-1 py-2 text-sm leading-relaxed text-ink-muted">
            No folders yet. Add one by browsing the server or typing a path.
          </p>
        ) : null}

        <ul className="space-y-0.5">
          {folders.map((folder) => {
            const active = activeToken === folder.token;
            return (
              <li key={folder.id} className="group relative flex items-center">
                <button
                  type="button"
                  onClick={() => onOpen(folder.token)}
                  aria-current={active ? "page" : undefined}
                  className={`flex min-h-11 w-full min-w-0 items-center gap-2 rounded-lg py-2 pl-2 pr-8 text-left text-sm transition ${
                    active
                      ? "bg-accent-strong/25 text-ink ring-1 ring-accent/50"
                      : "text-ink-muted hover:bg-surface-raised hover:text-ink"
                  } ${folder.exists ? "" : "line-through opacity-60"}`}
                  title={folder.exists ? folder.name : "This folder no longer exists on disk"}
                >
                  {folder.isDefault ? (
                    <HomeIcon className="shrink-0 text-accent" width={17} height={17} />
                  ) : (
                    <FolderIcon className="shrink-0 text-accent/80" width={17} height={17} />
                  )}
                  <span className="truncate">{folder.name}</span>
                </button>
                {!folder.isDefault ? (
                  <button
                    type="button"
                    onClick={() => onRemove(folder)}
                    aria-label={`Remove ${folder.name} from library`}
                    title="Remove from library (files are kept)"
                    className="absolute right-1 grid h-8 w-8 place-items-center rounded-lg text-ink-muted opacity-0 transition hover:bg-surface-sunken hover:text-danger focus-visible:opacity-100 group-hover:opacity-100 [@media(hover:none)]:opacity-70"
                  >
                    <CloseIcon width={16} height={16} />
                  </button>
                ) : null}
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}
