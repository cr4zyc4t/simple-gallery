#!/usr/bin/env node
/**
 * Apply drizzle-kit migrations from ./drizzle to the sqlite file.
 *
 *   npm run db:migrate
 *
 * The app also applies them automatically the first time it opens an empty
 * database, so this is only needed after adding new migrations.
 */
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";

const dbPath = path.resolve(process.cwd(), process.env.GALLERY_DB_PATH ?? "./data/gallery.db");
const migrationsFolder = path.resolve(process.cwd(), "drizzle");

fs.mkdirSync(path.dirname(dbPath), { recursive: true });
const sqlite = new Database(dbPath);
sqlite.pragma("journal_mode = WAL");

const db = drizzle(sqlite);
migrate(db, { migrationsFolder });

console.log(`[db] migrations applied to ${dbPath}`);
sqlite.close();
