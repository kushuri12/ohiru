import { HiruConfig } from "shared";
import fs from "fs-extra";
import path from "path";
import os from "os";

function getConfigPath() {
  return path.join(os.homedir(), ".hirurc");
}

// Simple obfuscation — NOT encryption, just prevents casual reading
function encode(s: string): string { return Buffer.from(s).toString("base64"); }
function decode(s: string): string { return Buffer.from(s, "base64").toString("utf-8"); }

export async function saveApiKeyToKeychain(_providerId: string, _apiKey: string) {
  // No-op — we now store everything in .hirurc
}

export async function getApiKeyFromKeychain(_providerId: string): Promise<string | null> {
  return null; // We read from .hirurc directly
}

export async function saveGlobalApiKey(_apiKey: string) {
  // No-op — global key concept is now handled by .hirurc directly
}

export async function saveConfig(config: HiruConfig) {
  const p = getConfigPath();
  const c: any = { ...config };

  // Encode the API key for storage (not plain text)
  if (c.apiKey && c.apiKey !== "dummy") {
    c._k = encode(c.apiKey);
  }
  delete c.apiKey;

  await fs.writeFile(p, JSON.stringify(c, null, 2), "utf-8");
}

export async function loadConfig(): Promise<HiruConfig | null> {
  const p = getConfigPath();

  // Also try loading .hiru.env for environment variable overrides
  const envPath = path.join(os.homedir(), ".hiru.env");
  try {
    const envRaw = await fs.readFile(envPath, "utf-8");
    envRaw.split("\n").forEach(line => {
      const eq = line.indexOf("=");
      if (eq > 0) {
        const key = line.slice(0, eq).trim();
        const val = line.slice(eq + 1).trim();
        if (key && val) process.env[key] = val;
      }
    });
  } catch (e) {}

  try {
    const raw = await fs.readFile(p, "utf-8");
    const parsed = JSON.parse(raw);

    // Decode stored API key
    if (parsed._k) {
      parsed.apiKey = decode(parsed._k);
      delete parsed._k;
    }

    return parsed as HiruConfig;
  } catch (e) {
    return null;
  }
}
