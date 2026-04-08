import Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import path from "node:path";
import os from "node:os";
import fs from "node:fs";
import { HIRU_DATA_DIR } from "../../utils/paths.js";

export interface Checkpoint {
  id: string;
  sessionId: string;
  iteration: number;
  timestamp: number;
  messages: string;     // JSON
  metadata: string;     // JSON (model, cwd, tokens)
  status: "active" | "completed" | "crashed";
}

/**
 * Manages atomic session saving using SQLite.
 * Uses Write-Ahead-Logging (WAL) for safety against power failure/crashes.
 */
export class CheckpointManager {
  private db: Database.Database;
  private sessionId: string;

  constructor(
    private currentSessionId?: string,
    private dbPath: string = path.join(HIRU_DATA_DIR, "checkpoints.db")
  ) {
    this.sessionId = currentSessionId || randomUUID();
    
    // Ensure parent directory exists before opening database
    const dir = path.dirname(this.dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    this.db = new Database(this.dbPath);
    this.setupDB();
  }

  private setupDB(): void {
    // WAL mode allows non-blocking reads and is safer for crashes
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("synchronous = NORMAL");

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS checkpoints (
        id          TEXT PRIMARY KEY,
        session_id  TEXT NOT NULL,
        iteration   INTEGER NOT NULL,
        timestamp   INTEGER NOT NULL,
        messages    TEXT NOT NULL,
        metadata    TEXT NOT NULL,
        status      TEXT DEFAULT 'active'
      );

      CREATE INDEX IF NOT EXISTS idx_session 
        ON checkpoints(session_id, timestamp);
    `);
  }

  /**
   * Saves an atomic snapshot of the current agent state.
   */
  async save(state: {
    messages: any[];
    iteration: number;
    metadata: Record<string, any>;
  }): Promise<string> {
    const id = randomUUID();

    // Only serialize last 20 messages to prevent memory blowup
    const trimmedMessages = state.messages.slice(-20);
    const messagesJson = JSON.stringify(trimmedMessages);
    const metadataJson = JSON.stringify(state.metadata);

    const stmt = this.db.prepare(`
      INSERT INTO checkpoints (id, session_id, iteration, timestamp, messages, metadata)
      VALUES (@id, @sessionId, @iteration, @timestamp, @messages, @metadata)
    `);

    stmt.run({
      id,
      sessionId: this.sessionId,
      iteration: state.iteration,
      timestamp: Date.now(),
      messages: messagesJson,
      metadata: metadataJson,
    });

    // Prune old checkpoints from this session (keep top 10)
    this.db.prepare(`
      DELETE FROM checkpoints 
      WHERE session_id = ? AND id NOT IN (
        SELECT id FROM checkpoints 
        WHERE session_id = ? 
        ORDER BY timestamp DESC 
        LIMIT 10
      )
    `).run(this.sessionId, this.sessionId);

    return id;
  }

  /**
   * Marks a session as crashed/completed.
   */
  updateSessionStatus(status: "completed" | "crashed"): void {
    this.db.prepare(`
      UPDATE checkpoints SET status = ? WHERE session_id = ?
    `).run(status, this.sessionId);
  }

  /**
   * Detects if there was a session that didn't exit cleanly.
   */
  detectPendingRestore(): Checkpoint | null {
    const row = this.db.prepare(`
      SELECT * FROM checkpoints 
      WHERE status = 'active' 
      ORDER BY timestamp DESC 
      LIMIT 1
    `).get() as Checkpoint | undefined;

    return row || null;
  }

  /**
   * Retrieves a specific checkpoint's full state.
   */
  restore(checkpointId: string): Checkpoint | undefined {
    return this.db.prepare("SELECT * FROM checkpoints WHERE id = ?").get(checkpointId) as any;
  }

  getSessionId(): string {
    return this.sessionId;
  }

  close(): void {
    if (this.db) {
      this.db.close();
    }
  }
}
