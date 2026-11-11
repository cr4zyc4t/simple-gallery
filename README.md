# Simple Gallery

A self-hosted image browser for folders that live on the server. Next.js (App
Router) + Tailwind CSS v4 on the front, Drizzle ORM + SQLite for the library,
sharp for thumbnails, Docker for deployment. No accounts, no upload queue — it
shows what is already on disk.

![Simple Gallery](public/icon.svg)

## What it does

| Requirement | Where |
| --- | --- |
| Lists the default folder on start | `GALLERY_ROOT` (default `./media`), server-rendered first paint |
| Add a folder by browsing **or** by typing a path | Library panel → **Add folder** (two tabs) |
| Listing shows only folders and images, folders first | `GET /api/listing` |
| Grid ⇄ list toggle, order by name or date, asc/desc | Toolbar; choices saved in a cookie and applied by the server on the first paint |
| Small thumbnails | `GET /api/thumb` — sharp → WebP, cached on disk |
| Click a thumbnail → carousel, slide between images in the folder | `Lightbox` (touch swipe, mouse drag, ← →, Home/End, Esc) |
| Zoom a picture | pinch, double-tap, `+`/`-`/`0`, ctrl+wheel; drag to pan while zoomed |
| Download an image, never a folder | `GET /api/download` rejects directories |
| Delete an image with confirmation | confirm dialog on every image delete |
| Delete a folder, confirm only when it is not empty | empty folders go straight away, non-empty ones ask first |
| Delete many items at once | toolbar **Select** → tap / hold / Shift+click → **Delete** (`DELETE /api/entry` with `paths[]`) |
| Responsive on desktop / tablet / mobile | sidebar on ≥1024px, drawer below; 2→8 column grid |
| Deploy with Docker | multi-stage `Dockerfile` + `docker-compose.yml` |
| Database | Drizzle ORM + better-sqlite3, table `folders` (the user's library list) |

The filesystem is the source of truth for media. SQLite only stores the folders
you added to the library, so deleting a library entry never touches files.

## Quick start (development)

```bash
npm install
npm run sample:images   # optional: generate demo images in ./media
npm run dev             # http://localhost:3000
```

Copy `.env.example` to `.env.local` to change the folders it reads.

## Run with Docker

```bash
docker compose up --build          # http://localhost:3000
```

or without compose:

```bash
docker build -t simple-gallery .
docker run -d --name gallery -p 3000:3000 \
  -v "$PWD/media:/data/gallery" \
  -v gallery-data:/data \
  simple-gallery
```

What the image does:

* multi-stage build, final stage is `node:24-bookworm-slim` running
  `node server.js` from the Next standalone output;
* runs as the non-root `nextjs` user, `HEALTHCHECK` probes `/api/state`;
* `/data` holds the SQLite database, the thumbnail cache and the default media
  folder — mount a volume there to keep them.

`docker-compose.yml` mounts `./media` into `/data/gallery` so the demo library
works out of the box. For real usage drop that line and mount your own photo
tree, e.g. `- /mnt/nas/photos:/data/gallery`.

## Configuration

| Variable | Default | Meaning |
| --- | --- | --- |
| `GALLERY_ROOT` | `./media` (`/data/gallery` in Docker) | Folder listed when the app starts. |
| `GALLERY_ALLOWED_ROOTS` | `GALLERY_ROOT` | Comma separated directories the app may browse, thumbnail and delete inside. |
| `GALLERY_DB_PATH` | `./data/gallery.db` | SQLite file (created automatically). |
| `GALLERY_CACHE_DIR` | `<db dir>/thumbs` | Where resized thumbnails are cached. |
| `GALLERY_READ_ONLY` | `0` | `1` hides and refuses every delete. |
| `GALLERY_MAX_PREVIEW_BYTES` | `64 MiB` | Larger files are streamed instead of resized. |
| `PORT` | `3000` | HTTP port. |

**Allow-listing paths.** Browsing outside the gallery root is opt-in:

```yaml
environment:
  GALLERY_ALLOWED_ROOTS: /data/photos,/mnt/nas/images
volumes:
  - /data/photos:/data/photos
  - /mnt/nas/images:/mnt/nas/images:ro   # read-only mount = deletes fail at the OS level
```

Anything outside those roots answers `403`, including `..` tricks and symlinks
that point out of the tree (`realpath` is re-checked on every request). Mount a
path read-only when you want browsing without deleting; the UI then shows the
OS error in a toast.

**There is no authentication** — that is by design, so keep this app on a
trusted network or behind a reverse proxy that adds auth.

## Database and migrations

`src/lib/db/schema.ts` defines one table:

```
folders(id, name, path UNIQUE, parent_path, is_default, created_at)
```

* On first start an empty database is migrated with the SQL in `drizzle/`.
* `npx drizzle-kit generate` after editing the schema, `npm run db:migrate` to
  apply to an existing file.
* `npm run db:studio` opens Drizzle Studio.

## HTTP API

| Method & path | Purpose |
| --- | --- |
| `GET /api/state` | default folder, allowed roots, read-only flag |
| `GET /api/listing?path=&sort=name\|date&dir=asc\|desc` | folders first, then images, with thumbnails' tokens |
| `GET /api/browse?path=` | sub-folders for the browser dialog (no token → allowed roots) |
| `GET/POST /api/library`, `DELETE /api/library/:id` | the saved folder list |
| `GET /api/entry?path=` | metadata; tells whether a folder is empty |
| `DELETE /api/entry` | `{path, kind}` for one item, or `{paths: […]}` for up to 500 — every token is validated before anything is deleted, each outcome is reported in `results[]` |
| `GET /api/thumb?path=&w=` | WebP thumbnail (128–1280 px), disk cached |
| `GET /api/image?path=` | full image, `Range` + `ETag` support |
| `GET /api/download?path=` | attachment download; folders are refused |

`path` values are base64url tokens of the resolved absolute path. They keep
absolute paths out of the DOM and are re-validated server side on every call —
they are **not** a capability or a secret.

## Implementation notes

* **Thumbnails** — sharp resizes to WebP (`/api/thumb?w=400` for the grid, 128
  for list rows), cached as `<sha1(path|mtime|size|width)>.webp`. Deleting an
  entry purges its cache rows through `thumbs/index.jsonl`. If sharp cannot load
  (unusual platform), routes fall back to the original bytes.
* **Carousel** — one track, `translate3d` per page, pointer events with velocity
  detection; only the previous/current/next `<img>` are mounted, so a folder of
  500 photos stays light. Edge arrows are hidden below `sm` so they never eat a
  swipe; phones get arrows in the bottom bar instead.
* **Zoom** — the zoom/pan transform is applied to the current `<img>` only, the
  paging track is never scaled, so the two gestures cannot fight. Two pointers
  pinch-zoom around the pinch midpoint (1×–5×, clamped to the picture's own
  edges), one finger pans while zoomed, and paging is disabled until you are
  back at 1×. The track is `touch-action: none`; the pointer is captured only
  once a drag really starts, so taps still reach the picture for double-tap and
  backdrop close. `0`, `+`, `-`, double-tap/double-click and ctrl+wheel all work.
* **Multi-select** — selection lives in React state, never in the database, and
  is dropped when you leave the folder. Tiles get a checkbox (`role="checkbox"`),
  a 420 ms hold starts selecting on touch, Shift+click extends a range, and the
  bottom bar offers All / Delete / Esc. Per-item delete buttons are hidden while
  selecting so a batch is never mixed with a single delete. In a batch, parents
  are deleted before their own children — a child that went with its folder is
  reported as `removedWithParent` instead of failing with `ENOENT`.
* **Deletes** — server refuses to delete `GALLERY_ROOT` or any allowed root,
  re-checks containment right before `fs.rm(recursive)`, and prunes library rows
  that pointed inside the removed tree. A read-only mount or a permission error
  comes back as `403`, not a `500`.
* **Preferences** (`src/lib/prefs.ts`) — layout and ordering live in the
  `gallery.prefs` cookie, not localStorage, because the first paint is rendered
  server side: the page has to emit the entries in the order you chose. Applying
  a stored `sort`/`view` after mount re-ordered the grid and swapped grid→list
  markup, which measured **CLS 0.52** (largest single shift 0.25, “poor” by
  Google's threshold); reading the cookie in `page.tsx` and skipping the now
  redundant startup fetch brings it to **CLS 0**. A stale or hand-edited cookie
  falls back to the defaults field by field.
* **Sorting** — `Intl.Collator({numeric:true})`, so `IMG_2.jpg` sorts before
  `IMG_10.jpg`; date mode falls back to the name for identical timestamps.
* Hidden entries (`.`, `~$`, `@eaDir`, `.DS_Store`, `Thumbs.db`, …) and non-image
  files never appear in the listing.

## Scripts

| Command | Does |
| --- | --- |
| `npm run dev` / `build` / `start` | Next.js development, build, production server |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run sample:images` | generate demo pictures in `./media` |
| `npm run db:generate` / `db:migrate` / `db:studio` | drizzle-kit / migration helpers |

## Browser support

Evergreen Chrome, Edge, Firefox, Safari (iOS 15+, Android Chrome). WebP
thumbnails, CSS grid, `dvh` units, pointer events; touch targets are ≥40 px.
