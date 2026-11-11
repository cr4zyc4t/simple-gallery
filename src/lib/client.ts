import type {
  BatchDeleteResponse,
  BrowseResponse,
  GalleryEntry,
  LibraryFolder,
  ListingResponse,
  SortDir,
  SortKey,
} from "./types";

export async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...(init?.headers ?? {}),
    },
  });
  const text = await response.text();
  const data = text ? (JSON.parse(text) as unknown) : null;
  if (!response.ok) {
    const message =
      data && typeof data === "object" && "error" in data
        ? String((data as { error: unknown }).error)
        : `Request failed (${response.status})`;
    throw new Error(message);
  }
  return data as T;
}

export const endpoints = {
  listing: (token: string | null, sort: SortKey, dir: SortDir) =>
    `/api/listing?${new URLSearchParams({
      ...(token ? { path: token } : {}),
      sort,
      dir,
    }).toString()}`,
  browse: (token: string | null) =>
    `/api/browse${token ? `?path=${encodeURIComponent(token)}` : ""}`,
  library: () => "/api/library",
  libraryFolder: (id: number) => `/api/library/${id}`,
  entry: (token: string) => `/api/entry?path=${encodeURIComponent(token)}`,
  entryMutate: () => "/api/entry",
  thumb: (token: string, width = 256) =>
    `/api/thumb?w=${width}&path=${encodeURIComponent(token)}`,
  image: (token: string) => `/api/image?path=${encodeURIComponent(token)}`,
  download: (token: string) => `/api/download?path=${encodeURIComponent(token)}`,
};

export function fetchListing(token: string | null, sort: SortKey, dir: SortDir) {
  return api<ListingResponse>(endpoints.listing(token, sort, dir));
}

export function fetchBrowse(token: string | null) {
  return api<BrowseResponse>(endpoints.browse(token));
}

export function fetchLibrary() {
  return api<{ folders: LibraryFolder[] }>(endpoints.library());
}

export function addLibraryFolder(input: { path?: string; token?: string }) {
  return api<{ folder: LibraryFolder; token: string; created: boolean }>(endpoints.library(), {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function removeLibraryFolder(id: number) {
  return api<{ removed: boolean }>(endpoints.libraryFolder(id), { method: "DELETE" });
}

export type EntryStats =
  | {
      kind: "folder";
      name: string;
      modifiedAt: number;
      counts: { folders: number; images: number; other: number };
      empty: boolean;
    }
  | {
      kind: "image";
      name: string;
      modifiedAt: number;
      sizeBytes: number;
      mime: string;
      isImage: boolean;
    };

export function fetchEntryStats(token: string) {
  return api<EntryStats>(endpoints.entry(token));
}

export function deleteEntry(token: string, kind: GalleryEntry["kind"]) {
  return api<{ deleted: boolean }>(endpoints.entryMutate(), {
    method: "DELETE",
    body: JSON.stringify({ path: token, kind }),
  });
}

/** Delete several images and/or folders in one request. */
export function deleteEntries(tokens: string[]) {
  return api<BatchDeleteResponse>(endpoints.entryMutate(), {
    method: "DELETE",
    body: JSON.stringify({ paths: tokens }),
  });
}
