/**
 * Screen ⇄ URL.
 *
 * The folder and the open picture are encoded in the query string so that the
 * Back button behaves like it does in a native app: back from a picture closes
 * it, back from a folder goes up one level, and any screen can be shared or
 * reloaded. `path` tokens are already opaque base64url strings, so they are safe
 * to put in a URL; the server re-validates them on every request either way.
 */
export const FOLDER_PARAM = "d";
export const IMAGE_PARAM = "i";

export interface Screen {
  folder: string | null;
  image: string | null;
}

/** Parse a `location.search` (or a plain query string) into a screen. */
export function readScreen(search: string | null | undefined): Screen {
  const params = new URLSearchParams(search ?? "");
  return {
    folder: params.get(FOLDER_PARAM) || null,
    image: params.get(IMAGE_PARAM) || null,
  };
}

export function searchFor(screen: Screen): string {
  const params = new URLSearchParams();
  if (screen.folder) params.set(FOLDER_PARAM, screen.folder);
  if (screen.image) params.set(IMAGE_PARAM, screen.image);
  const query = params.toString();
  return query ? `?${query}` : "";
}

export function urlFor(screen: Screen, pathname = "/"): string {
  return `${pathname}${searchFor(screen)}`;
}
