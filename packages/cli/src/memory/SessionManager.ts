import Database from "better-sqlite3";
import fs from "fs-extra";
import path from "path";
import os from "os";
import { HIRU_DATA_DIR } from "../utils/paths.js";

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

export async function initDB() {
  if (db) return db;
  const { ensureHiruDirs } = await import("../utils/paths.js");
  await ensureHiruDirs();
  
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
  
  return db;
}

export async function saveSession(session: Session) {
  const d = await initDB();
  const stmt = d.prepare(`
    INSERT INTO sessions (id, name, projectRoot, messages, tokenUsage, createdAt, updatedAt)
    VALUES (@id, @name, @projectRoot, @messages, @tokenUsage, @createdAt, @updatedAt)
    ON CONFLICT(id) DO UPDATE SET
      messages = excluded.messages,
      tokenUsage = excluded.tokenUsage,
      updatedAt = excluded.updatedAt
  `);
  stmt.run(session);
}

export async function getSession(id: string): Promise<Session | undefined> {
  const d = await initDB();
  const stmt = d.prepare("SELECT * FROM sessions WHERE id = ?");
  return stmt.get(id);
}

export async function listSessions(): Promise<Session[]> {
  const d = await initDB();
  const stmt = d.prepare("SELECT * FROM sessions ORDER BY updatedAt DESC");
  return stmt.all();
}

export async function deleteSession(id: string) {
  const d = await initDB();
  const stmt = d.prepare("DELETE FROM sessions WHERE id = ?");
  stmt.run(id);
}

export async function clearAllSessions() {
  const d = await initDB();
  const stmt = d.prepare("DELETE FROM sessions");
  stmt.run();
}

export async function closeDB() {
  if (db) {
    db.close();
    db = null;
  }
}
