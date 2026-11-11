import { GALLERY_ROOT, READ_ONLY } from "@/lib/config";
import { cookies } from "next/headers";
import { ensureRootExists, folderInfo, listGalleryDir } from "@/lib/fs/gallery";
import { ensureDefaultFolder, listFolders } from "@/lib/db";
import { toLibraryFolder } from "@/lib/library";
import { DEFAULT_PREFS, PREFS_COOKIE, decodePrefs } from "@/lib/prefs";
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
  // The ordering lives in a cookie precisely so that this first paint already
  // uses it — otherwise the grid would be re-rendered in another order.
  const prefs = await cookies()
    .then((store) => decodePrefs(store.get(PREFS_COOKIE)?.value))
    .catch(() => DEFAULT_PREFS);

  let initial: ListingResponse;
  try {
    ensureRootExists();
    ensureDefaultFolder();
    const entries: GalleryEntry[] = await listGalleryDir(GALLERY_ROOT, {
      key: prefs.sort,
      dir: prefs.dir,
    });
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

  return <Gallery initialListing={initial} initialLibrary={library} initialPrefs={prefs} />;
}
