export type SortKey = "name" | "date";
export type SortDir = "asc" | "desc";
export type ViewMode = "grid" | "list";
export type EntryKind = "folder" | "image";

export interface GalleryEntry {
  kind: EntryKind;
  name: string;
  /** Opaque, validated handle for the underlying filesystem path. */
  token: string;
  modifiedAt: number | null;
  sizeBytes: number | null;
  extension: string | null;
  /** For folders: thumbnail of the first picture inside, when there is one. */
  coverToken: string | null;
}

export interface FolderInfo {
  token: string;
  name: string;
  parentToken: string | null;
  isRoot: boolean;
  /** Human readable breadcrumb trail, outermost first. */
  trail: Array<{ token: string; name: string }>;
  isAllowedRoot: boolean;
  inLibrary: boolean;
}

export interface ListingResponse {
  folder: FolderInfo;
  entries: GalleryEntry[];
  counts: { folders: number; images: number };
  readOnly: boolean;
}

export interface BrowseEntry {
  name: string;
  token: string;
  hasChildren: boolean;
}

export interface BrowseResponse {
  current: { token: string; name: string; parentToken: string | null } | null;
  roots: Array<{ token: string; name: string }>;
  entries: BrowseEntry[];
  readOnly: boolean;
}

export interface LibraryFolder {
  id: number;
  name: string;
  token: string;
  isDefault: boolean;
  createdAt: number;
  exists: boolean;
}
