import Database from "better-sqlite3";
import path from "path";
import fs from "fs";
import { SCHEMA_SQL } from "./schema";

const DB_DIR = path.join(process.cwd(), "data");
const DB_PATH = path.join(DB_DIR, "library.db");
export const UPLOADS_DIR = path.join(DB_DIR, "uploads");

let dbInstance: Database.Database | null = null;

export function getDatabase(): Database.Database {
  if (dbInstance) {
    return dbInstance;
  }

  // Ensure data and uploads directories exist
  if (!fs.existsSync(DB_DIR)) {
    fs.mkdirSync(DB_DIR, { recursive: true });
  }
  if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  }

  dbInstance = new Database(DB_PATH);

  // Performance and safety pragmas
  dbInstance.pragma("journal_mode = WAL");
  dbInstance.pragma("foreign_keys = ON");

  // Run schema initialization
  dbInstance.exec(SCHEMA_SQL);

  // Safe migrations for newly added columns if table previously existed
  try {
    const columns = dbInstance.prepare("PRAGMA table_info(papers)").all() as { name: string }[];
    const colNames = new Set(columns.map((c) => c.name));

    if (!colNames.has("file_path")) {
      dbInstance.exec("ALTER TABLE papers ADD COLUMN file_path TEXT;");
    }
    if (!colNames.has("file_name")) {
      dbInstance.exec("ALTER TABLE papers ADD COLUMN file_name TEXT;");
    }
    if (!colNames.has("file_size")) {
      dbInstance.exec("ALTER TABLE papers ADD COLUMN file_size INTEGER;");
    }
  } catch (migErr) {
    console.error("Migration error checking papers columns:", migErr);
  }

  return dbInstance;
}

export default getDatabase;
