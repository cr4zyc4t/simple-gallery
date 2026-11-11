import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

/**
 * Folders explicitly added by the user (by browsing or by typing a path).
 * The filesystem stays the source of truth for the media itself — this table is
 * only the user's library / bookmark list.
 */
export const folders = sqliteTable(
  "folders",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    name: text("name").notNull(),
    /** Real (resolved) absolute path on the server. */
    path: text("path").notNull(),
    /** Token of the parent folder, used for the sidebar tree hint. Null for roots. */
    parentPath: text("parent_path"),
    isDefault: integer("is_default", { mode: "boolean" }).notNull().default(false),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
  (table) => [
    uniqueIndex("folders_path_idx").on(table.path),
    index("folders_parent_idx").on(table.parentPath),
  ],
);

export type FolderRow = typeof folders.$inferSelect;
export type NewFolderRow = typeof folders.$inferInsert;
