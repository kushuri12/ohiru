import fs from "fs-extra";
import path from "path";
import os from "os";
import { HIRU_DATA_DIR } from "../utils/paths.js";

export interface GlobalMemoryData {
    identity?: string;     // The "Soul" or core persona of the agent
    facts: string[];
    preferences: Record<string, string>;
}

export class GlobalMemory {
    private readonly memoryFile: string;
    private data: GlobalMemoryData = { facts: [], preferences: {} };

    constructor() {
        this.memoryFile = path.join(HIRU_DATA_DIR, "memory.json");
    }

    async init() {
        try {
            const dir = path.dirname(this.memoryFile);
            await fs.mkdir(dir, { recursive: true });
            const content = await fs.readFile(this.memoryFile, "utf-8");
            this.data = JSON.parse(content);
            if (!this.data.facts) this.data.facts = [];
            if (!this.data.preferences) this.data.preferences = {};
        } catch (e) {
            // If file doesn't exist, we just start with empty data
            this.data = { facts: [], preferences: {} };
            await this.save();
        }
    }

    async save() {
        await fs.writeFile(this.memoryFile, JSON.stringify(this.data, null, 2), "utf-8");
    }

    async addFact(fact: string) {
        if (!this.data.facts.includes(fact)) {
            this.data.facts.push(fact);
            await this.save();
        }
    }

    async removeFact(index: number) {
        if (index >= 0 && index < this.data.facts.length) {
            this.data.facts.splice(index, 1);
            await this.save();
        }
    }

    async setIdentity(identity: string) {
        this.data.identity = identity;
        await this.save();
    }

    async setPreference(key: string, value: string) {
        this.data.preferences[key] = value;
        await this.save();
    }

    async deletePreference(key: string) {
        delete this.data.preferences[key];
        await this.save();
    }

    getData(): GlobalMemoryData {
        return this.data;
    }

    formatForPrompt(): string {
        const parts = [];
        if (this.data.facts.length > 0) {
            parts.push("Facts about the User/Environment:");
            this.data.facts.forEach((f, i) => parts.push(`${i}. ${f}`));
        }
        const prefs = Object.entries(this.data.preferences);
        if (prefs.length > 0) {
            parts.push("User Preferences:");
            prefs.forEach(([k, v]) => parts.push(`- ${k}: ${v}`));
        }
        
        if (parts.length === 0) return "Global Memory is empty.";
        return parts.join("\n");
    }
}
