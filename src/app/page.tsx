import { cookies } from "next/headers";
import { GALLERY_ROOT, READ_ONLY } from "@/lib/config";
import { ensureDefaultFolder, listFolders } from "@/lib/db";
import { ensureRootExists, folderInfo } from "@/lib/fs/gallery";
import { toLibraryFolder } from "@/lib/library";
import { buildListing } from "@/lib/listing";
import { DEFAULT_PREFS, PREFS_COOKIE, decodePrefs } from "@/lib/prefs";
import { FOLDER_PARAM, IMAGE_PARAM, type Screen } from "@/lib/url-state";
import Gallery from "@/components/Gallery";
import type { ListingResponse } from "@/lib/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const metadata = { title: "Simple Gallery" };

type Params = Record<string, string | string[] | undefined>;

const single = (value: string | string[] | undefined): string | null =>
  typeof value === "string" && value.length > 0 ? value : null;

const EMPTY_LISTING = (readOnly: boolean): ListingResponse => ({
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
  readOnly,
});

/**
 * Server-rendered first paint. `?d=<folder token>` and `?i=<picture token>` are
 * the shareable/back-button form of the current screen, and the server honours
 * them so a deep link renders the right folder (and opens the right picture once
 * hydrated) instead of flashing the gallery root.
 */
export default async function HomePage({ searchParams }: { searchParams: Promise<Params> }) {
  const params = await searchParams.catch(() => ({}) as Params);
  const screen: Screen = {
    folder: single(params[FOLDER_PARAM]),
    image: single(params[IMAGE_PARAM]),
  };

  // The ordering lives in a cookie precisely so that this first paint already
  // uses it — otherwise the grid would be re-rendered in another order.
  const prefs = await cookies()
    .then((store) => decodePrefs(store.get(PREFS_COOKIE)?.value))
    .catch(() => DEFAULT_PREFS);

  let initial = EMPTY_LISTING(READ_ONLY);
  try {
    ensureRootExists();
    ensureDefaultFolder();
    initial = await buildListing(screen.folder, prefs.sort, prefs.dir);
  } catch (error) {
    console.error("[gallery] could not list the requested folder", error);
    // A stale or hand-written `?d=` must still show something: fall back to the
    // gallery root, and let the client rewrite the address bar to match.
    try {
      initial = await buildListing(null, prefs.sort, prefs.dir);
    } catch (fallbackError) {
      console.error("[gallery] the gallery root itself is unavailable", fallbackError);
    }
  }

  // The address bar spells the gallery root as "no folder", so the client has to
  // recognise its token. Same helper the listings use, so the tokens match.
  const rootToken = (() => {
    try {
      return folderInfo(GALLERY_ROOT, true).token;
    } catch (error) {
      console.error("[gallery] gallery root unavailable", error);
      return "";
    }
  })();

  const library = (() => {
    try {
      return listFolders().map(toLibraryFolder);
    } catch (error) {
      console.error("[gallery] library unavailable", error);
      return [];
    }
  })();

  // Only trust the picture token when it belongs to the folder we managed to show.
  const image =
    screen.image && initial.entries.some((entry) => entry.kind === "image" && entry.token === screen.image)
      ? screen.image
      : null;

  return (
    <Gallery
      initialListing={initial}
      initialLibrary={library}
      initialPrefs={prefs}
      initialImage={image}
      rootToken={rootToken}
    />
  );
}
