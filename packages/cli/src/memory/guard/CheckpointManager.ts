// packages/cli/src/memory/guard/CheckpointManager.ts
import { randomUUID } from "node:crypto";
import path from "node:path";
import fs from "node:fs";
import { HIRU_DATA_DIR } from "../../utils/paths.js";
import chalk from "chalk";

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
          this.data.push(item);
          this.save();
        } else if (sql.includes("DELETE")) {
          // Simplified pruning for fallback
          if (this.data.length > 20) this.data = this.data.slice(-10);
          this.save();
        } else if (sql.includes("UPDATE")) {
           const sid = Array.isArray(args) ? args[1] : (args as any).sessionId;
           this.data.forEach(d => { if (d.session_id === sid) d.status = Array.isArray(args) ? args[0] : (args as any).status; });
           this.save();
        }
      },
      get: (id?: string) => {
        if (!id) return this.data[this.data.length - 1];
        return this.data.find(d => d.id === id);
      }
    };
  }
  pragma() {}
  exec() {}
  close() { this.save(); }
  private save() { fs.writeFileSync(this.path + ".json", JSON.stringify(this.data, null, 2)); }
}

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
 * Manages atomic session saving. Uses SQLite (WAL) if available, falls back to JSON.
 */
export class CheckpointManager {
  private db: any = null;
  private sessionId: string;
  private isEnabled = true;

  constructor(
    private currentSessionId?: string,
    private dbPath: string = path.join(HIRU_DATA_DIR, "checkpoints.db")
  ) {
    this.sessionId = currentSessionId || randomUUID();
    
    try {
      const dir = path.dirname(this.dbPath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

      if (Database) {
        this.db = new Database(this.dbPath);
        this.setupDB();
      } else {
        this.db = new JSONDBFallback(this.dbPath);
      }
    } catch (err: any) {
      this.isEnabled = false;
      this.db = null;
    }
  }

  private setupDB(): void {
    if (!this.db || !Database) return;
    try {
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
        CREATE INDEX IF NOT EXISTS idx_session ON checkpoints(session_id, timestamp);
      `);
    } catch (e) {
      this.isEnabled = false;
    }
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
    if (!this.db || !this.isEnabled) return id;

    try {
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
    } catch (e) {
      // Silent fail for checkpoints — they are a convenience, not a requirement
    }

    return id;
  }

  /**
   * Marks a session as crashed/completed.
   */
  updateSessionStatus(status: "completed" | "crashed"): void {
    if (!this.db || !this.isEnabled) return;
    try {
      this.db.prepare(`
        UPDATE checkpoints SET status = ? WHERE session_id = ?
      `).run(status, this.sessionId);
    } catch (e) {}
  }

  /**
   * Detects if there was a session that didn't exit cleanly.
   */
  detectPendingRestore(): Checkpoint | null {
    if (!this.db || !this.isEnabled) return null;
    try {
      const row = this.db.prepare(`
        SELECT * FROM checkpoints 
        WHERE status = 'active' 
        ORDER BY timestamp DESC 
        LIMIT 1
      `).get() as Checkpoint | undefined;

      return row || null;
    } catch (e) {
      return null;
    }
  }

  /**
   * Retrieves a specific checkpoint's full state.
   */
  restore(checkpointId: string): Checkpoint | undefined {
    if (!this.db || !this.isEnabled) return undefined;
    try {
      return this.db.prepare("SELECT * FROM checkpoints WHERE id = ?").get(checkpointId) as any;
    } catch (e) {
      return undefined;
    }
  }

  getSessionId(): string {
    return this.sessionId;
  }

  close(): void {
    if (this.db) {
      try {
        this.db.close();
      } catch (e) {}
    }
  }
}
