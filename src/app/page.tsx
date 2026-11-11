import { GALLERY_ROOT, READ_ONLY } from "@/lib/config";
import { ensureRootExists, folderInfo, listGalleryDir } from "@/lib/fs/gallery";
import { ensureDefaultFolder, listFolders } from "@/lib/db";
import { toLibraryFolder } from "@/lib/library";
import Gallery from "@/components/Gallery";
import type { GalleryEntry, ListingResponse } from "@/lib/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const metadata = { title: "Simple Gallery" };

/**
 * Server-rendered first paint: the default gallery folder is listed on the
 * server so the grid is visible before any client fetch.
 */
export default async function HomePage() {
  let initial: ListingResponse;
  try {
    ensureRootExists();
    ensureDefaultFolder();
    const entries: GalleryEntry[] = await listGalleryDir(GALLERY_ROOT, { key: "name", dir: "asc" });
    const folder = folderInfo(GALLERY_ROOT, true);
    initial = {
      folder,
      entries,
      counts: {
        folders: entries.filter((entry) => entry.kind === "folder").length,
        images: entries.filter((entry) => entry.kind === "image").length,
      },
      readOnly: READ_ONLY,
    };
  } catch (error) {
    console.error("[gallery] could not list the default folder", error);
    initial = {
      folder: {
        token: "",
        name: "Gallery root",
        parentToken: null,
        isRoot: true,
        trail: [],
        isAllowedRoot: true,
        inLibrary: true,
      },
      entries: [],
      counts: { folders: 0, images: 0 },
      readOnly: READ_ONLY,
    };
  }

  const library = (() => {
    try {
      return listFolders().map(toLibraryFolder);
    } catch (error) {
      console.error("[gallery] library unavailable", error);
      return [];
    }
  })();

  return <Gallery initialListing={initial} initialLibrary={library} />;
}
