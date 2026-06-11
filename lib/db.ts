import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

const globalForDb = globalThis as unknown as { jarvisDb?: Database.Database };

function databasePath() {
  const configured = process.env.DATABASE_URL?.replace(/^file:/, "");
  return path.resolve(process.cwd(), configured || "db/jarvis.sqlite");
}

export function getDb() {
  if (globalForDb.jarvisDb) return globalForDb.jarvisDb;

  const dbPath = databasePath();
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });

  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  const schema = fs.readFileSync(path.join(process.cwd(), "db/schema.sql"), "utf8");
  db.exec(schema);

  globalForDb.jarvisDb = db;
  return db;
}

export function id(prefix: string) {
  return `${prefix}_${crypto.randomUUID()}`;
}
