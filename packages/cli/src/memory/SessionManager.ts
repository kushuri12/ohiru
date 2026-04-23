// packages/cli/src/memory/SessionManager.ts
import fs from "fs-extra";
import path from "path";
import { HIRU_DATA_DIR } from "../utils/paths.js";

let Database: any;
try {
  const module = await import("better-sqlite3");
  Database = module.default;
} catch (e) {
  Database = null;
}

/**
 * Simple JSON-based fallback for environments where native SQLite is unavailable.
 */
class JSONDBFallback {
  private data: any[] = [];
  constructor(private path: string) {
    if (fs.existsSync(path)) {
      try { this.data = JSON.parse(fs.readFileSync(path, "utf-8")); } catch { this.data = []; }
    }
  }
  prepare(sql: string) {
    return {
      run: (args: any) => {
        if (sql.includes("INSERT")) {
          const item = { ...args };
          const idx = this.data.findIndex(d => d.id === item.id);
          if (idx >= 0) this.data[idx] = item; else this.data.push(item);
          this.save();
        } else if (sql.includes("DELETE")) {
          if (sql.includes("WHERE id")) {
             this.data = this.data.filter(d => d.id !== args);
          } else {
             this.data = [];
          }
          this.save();
        }
      },
      get: (id: string) => {
        return this.data.find(d => d.id === id);
      },
      all: () => {
        return [...this.data].sort((a, b) => b.updatedAt - a.updatedAt);
      }
    };
  }
  pragma() {}
  exec() {}
  close() { this.save(); }
  private save() { fs.writeFileSync(this.path + ".json", JSON.stringify(this.data, null, 2)); }
}

export interface Session {
  id: string;
  name: string;
  projectRoot: string;
  messages: string; // JSON
  tokenUsage: string; // JSON
  createdAt: number;
  updatedAt: number;
}

function getDbPath() {
  return path.join(HIRU_DATA_DIR, "sessions.db");
}

let db: any = null;
let isEnabled = false;

export async function initDB() {
  if (db) return db;

  try {
    const { ensureHiruDirs } = await import("../utils/paths.js");
    await ensureHiruDirs();
    
    if (Database) {
      db = new Database(getDbPath());
      db.pragma('journal_mode = WAL');

      db.exec(`
        CREATE TABLE IF NOT EXISTS sessions (
          id TEXT PRIMARY KEY,
          name TEXT,
          projectRoot TEXT,
          messages TEXT,
          tokenUsage TEXT,
          createdAt INTEGER,
          updatedAt INTEGER
        )
      `);
    } else {
      db = new JSONDBFallback(getDbPath());
    }
    
    isEnabled = true;
    return db;
  } catch (e) {
    db = null;
    isEnabled = false;
    return null;
  }
}

export async function saveSession(session: Session) {
  const d = await initDB();
  if (!d || !isEnabled) return;
  try {
    const stmt = d.prepare(`
      INSERT INTO sessions (id, name, projectRoot, messages, tokenUsage, createdAt, updatedAt)
      VALUES (@id, @name, @projectRoot, @messages, @tokenUsage, @createdAt, @updatedAt)
      ON CONFLICT(id) DO UPDATE SET
        messages = excluded.messages,
        tokenUsage = excluded.tokenUsage,
        updatedAt = excluded.updatedAt
    `);
    stmt.run(session);
  } catch (e) {}
}

export async function getSession(id: string): Promise<Session | undefined> {
  const d = await initDB();
  if (!d || !isEnabled) return undefined;
  try {
    const stmt = d.prepare("SELECT * FROM sessions WHERE id = ?");
    return stmt.get(id);
  } catch (e) {
    return undefined;
  }
}

export async function listSessions(): Promise<Session[]> {
  const d = await initDB();
  if (!d || !isEnabled) return [];
  try {
    const stmt = d.prepare("SELECT * FROM sessions ORDER BY updatedAt DESC");
    return stmt.all();
  } catch (e) {
    return [];
  }
}

export async function deleteSession(id: string) {
  const d = await initDB();
  if (!d || !isEnabled) return;
  try {
    const stmt = d.prepare("DELETE FROM sessions WHERE id = ?");
    stmt.run(id);
  } catch (e) {}
}

export async function clearAllSessions() {
  const d = await initDB();
  if (!d || !isEnabled) return;
  try {
    const stmt = d.prepare("DELETE FROM sessions");
    stmt.run();
  } catch (e) {}
}

export async function closeDB() {
  if (db) {
    try {
      db.close();
    } catch (e) {}
    db = null;
    isEnabled = false;
  }
}
