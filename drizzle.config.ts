import { defineConfig } from "drizzle-kit";

/**
 * drizzle-kit config. Migrations live in ./drizzle and are generated from
 * ./src/lib/db/schema.ts.
 *
 *   npx drizzle-kit generate   # create SQL migrations
 *   npx drizzle-kit push       # push schema straight to the sqlite file
 *
 * The app also self-heals missing tables at boot (see src/lib/db/index.ts) so a
 * fresh container works without a separate migrate step.
 */
export default defineConfig({
  dialect: "sqlite",
  schema: "./src/lib/db/schema.ts",
  out: "./drizzle",
  dbCredentials: {
    url: process.env.GALLERY_DB_PATH ?? "./data/gallery.db",
  },
});
