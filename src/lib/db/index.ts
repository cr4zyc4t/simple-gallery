import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { and, asc, eq, sql } from "drizzle-orm";
import { DB_PATH, GALLERY_ROOT } from "@/lib/config";
import { folders, type FolderRow } from "./schema";
import { realPathOrNearest } from "@/lib/fs/safe-path";

/** Folder holding drizzle-kit generated SQL migrations. */
const MIGRATIONS_DIR = path.resolve(process.cwd(), "drizzle");

function tableExists(sqlite: Database.Database, name: string): boolean {
  const row = sqlite
    .prepare("select name from sqlite_master where type = 'table' and name = ?")
    .get(name);
  return Boolean(row);
}

/**
 * Schema handling: apply the generated migrations on a fresh database, keep an
 * existing one untouched. Falls back to inline DDL when the migrations folder
 * was not shipped with the build.
 */
function ensureSchema(sqlite: Database.Database, client: Db): void {
  if (tableExists(sqlite, "folders")) return;
  const journal = path.join(MIGRATIONS_DIR, "meta", "_journal.json");
  if (fs.existsSync(journal)) {
    try {
      migrate(client, { migrationsFolder: MIGRATIONS_DIR });
      return;
    } catch (error) {
      console.error("[gallery] drizzle migration failed, falling back to bootstrap DDL", error);
    }
  }
  sqlite.exec(BOOTSTRAP_SQL);
}

function createDb() {
  const sqlite = openDatabase();
  const client = drizzle(sqlite, { schema: { folders } });
  ensureSchema(sqlite, client);
  return client;
}

type Db = ReturnType<typeof createDb>;

const BOOTSTRAP_SQL = `
CREATE TABLE IF NOT EXISTS folders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  path TEXT NOT NULL,
  parent_path TEXT,
  is_default INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);
CREATE UNIQUE INDEX IF NOT EXISTS folders_path_idx ON folders (path);
CREATE INDEX IF NOT EXISTS folders_parent_idx ON folders (parent_path);
`;

const globalForDb = globalThis as unknown as { __galleryDb?: Database.Database };

function openDatabase(): Database.Database {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  const sqlite =
    globalForDb.__galleryDb ??
    new Database(DB_PATH, { fileMustExist: false, timeout: 5000 });
  globalForDb.__galleryDb = sqlite;
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("busy_timeout = 5000");
  return sqlite;
}

let cached: Db | null = null;

export function getDb(): Db {
  cached ??= createDb();
  return cached;
}

/** Makes sure the default gallery folder is present in the library list. */
export function ensureDefaultFolder(): FolderRow | null {
  const db = getDb();
  const rootPath = realPathOrNearest(GALLERY_ROOT);
  const existing = db.select().from(folders).where(eq(folders.path, rootPath)).all();
  if (existing.length > 0) return existing[0];
  const inserted = db
    .insert(folders)
    .values({
      name: "Gallery root",
      path: rootPath,
      parentPath: null,
      isDefault: true,
    })
    .onConflictDoNothing()
    .returning()
    .all();
  if (inserted.length > 0) return inserted[0];
  const after = db.select().from(folders).where(eq(folders.path, rootPath)).all();
  return after[0] ?? null;
}

export function listFolders(): FolderRow[] {
  const db = getDb();
  return db.select().from(folders).orderBy(asc(folders.isDefault), asc(folders.name)).all();
}

export function findFolderByPath(folderPath: string): FolderRow | null {
  const db = getDb();
  const rows = db.select().from(folders).where(eq(folders.path, folderPath)).all();
  return rows[0] ?? null;
}

export function addFolder(input: {
  name: string;
  path: string;
  parentPath?: string | null;
}): FolderRow {
  const db = getDb();
  const row = db
    .insert(folders)
    .values({
      name: input.name,
      path: input.path,
      parentPath: input.parentPath ?? null,
      isDefault: false,
    })
    .onConflictDoNothing()
    .returning()
    .all();
  if (row.length > 0) return row[0];
  const existing = findFolderByPath(input.path);
  if (!existing) throw new Error("Could not add folder");
  return existing;
}

/** better-sqlite3 reports write counts in slightly different shapes per version. */
function changedRows(result: unknown): number {
  const candidate = result as { changes?: number } | number | undefined | null;
  if (typeof candidate === "number") return candidate;
  return candidate?.changes ?? 0;
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

export function removeFolderById(id: number): number {
  const db = getDb();
  return changedRows(db.delete(folders).where(eq(folders.id, id)).run());
}

/** Drop library entries that pointed at a deleted directory (and its children). */
export function removeFoldersUnder(deletedPath: string): number {
  const db = getDb();
  const direct = changedRows(db.delete(folders).where(eq(folders.path, deletedPath)).run());
  const children = changedRows(
    db
      .delete(folders)
      .where(sql`${folders.path} LIKE ${escapeLike(`${deletedPath}${path.sep}%`)} ESCAPE '\\'`)
      .run(),
  );
  return direct + children;
}

export function isDefaultFolder(folderPath: string): boolean {
  const db = getDb();
  const rows = db
    .select()
    .from(folders)
    .where(and(eq(folders.path, folderPath), eq(folders.isDefault, true)))
    .all();
  return rows.length > 0;
}
