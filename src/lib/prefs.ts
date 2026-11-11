import type { SortDir, SortKey, ViewMode } from "./types";

/**
 * Viewer preferences (layout, ordering).
 *
 * They live in a cookie rather than localStorage on purpose: the first paint is
 * rendered on the server, so the server has to know the ordering to emit the
 * entries in the right order. Reading them after mount would re-order the grid
 * and swap grid/list markup after the fact — a visible layout shift on every
 * load.
 */
export const PREFS_COOKIE = "gallery.prefs";

export interface Prefs {
  view: ViewMode;
  sort: SortKey;
  dir: SortDir;
}

export const DEFAULT_PREFS: Prefs = { view: "grid", sort: "name", dir: "asc" };

const VIEWS: ViewMode[] = ["grid", "list"];
const SORTS: SortKey[] = ["name", "date"];
const DIRS: SortDir[] = ["asc", "desc"];

/** `v=list&s=date&d=desc` — only fixed tokens, so nothing needs escaping. */
export function encodePrefs(prefs: Prefs): string {
  return `v=${prefs.view}&s=${prefs.sort}&d=${prefs.dir}`;
}

/** Tolerant on purpose: a hand-edited or stale cookie falls back per field. */
export function decodePrefs(raw: string | null | undefined): Prefs {
  if (!raw) return DEFAULT_PREFS;
  const fields = new Map<string, string>();
  for (const part of raw.split("&")) {
    const index = part.indexOf("=");
    if (index > 0) fields.set(part.slice(0, index), part.slice(index + 1));
  }
  const pick = <T extends string>(key: string, allowed: T[], fallback: T): T => {
    const value = fields.get(key) as T | undefined;
    return value && allowed.includes(value) ? value : fallback;
  };
  return {
    view: pick("v", VIEWS, DEFAULT_PREFS.view),
    sort: pick("s", SORTS, DEFAULT_PREFS.sort),
    dir: pick("d", DIRS, DEFAULT_PREFS.dir),
  };
}

/** Set-Cookie fragment the browser writes on every change. */
export function prefsCookie(prefs: Prefs): string {
  return `${PREFS_COOKIE}=${encodePrefs(prefs)}; Path=/; Max-Age=31536000; SameSite=Lax`;
}
