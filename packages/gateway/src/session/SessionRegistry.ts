import fs from "fs-extra";
import path from "path";
import os from "os";
import { SessionState, SessionStateSchema } from "./SessionState.js";

export class SessionRegistry {
  private sessionsDir: string;

  constructor(customDir?: string) {
    this.sessionsDir = customDir || path.join(os.homedir(), ".hiru", "gateway", "sessions");
    fs.ensureDirSync(this.sessionsDir);
  }

  public async saveSession(session: SessionState): Promise<void> {
    const validated = SessionStateSchema.parse(session);
    const filePath = path.join(this.sessionsDir, `${session.id}.json`);
    await fs.writeJson(filePath, validated, { spaces: 2 });
  }

  public async getSession(id: string): Promise<SessionState | null> {
    const filePath = path.join(this.sessionsDir, `${id}.json`);
    if (!(await fs.pathExists(filePath))) return null;
    const data = await fs.readJson(filePath);
    return SessionStateSchema.parse(data);
  }

  public async deleteSession(id: string): Promise<void> {
    const filePath = path.join(this.sessionsDir, `${id}.json`);
    await fs.remove(filePath);
  }

  public async listSessions(): Promise<SessionState[]> {
    const files = await fs.readdir(this.sessionsDir);
    const sessions: SessionState[] = [];
    for (const file of files) {
      if (file.endsWith(".json")) {
        const id = file.replace(".json", "");
        const session = await this.getSession(id);
        if (session) sessions.push(session);
      }
    }
    return sessions;
  }

  public async prune(daysOlderThan: number): Promise<number> {
    const sessions = await this.listSessions();
    const now = Date.now();
    let count = 0;
    for (const session of sessions) {
      const ageMs = now - new Date(session.updatedAt).getTime();
      if (ageMs > daysOlderThan * 24 * 60 * 60 * 1000) {
        await this.deleteSession(session.id);
        count++;
      }
    }
    return count;
  }
}
