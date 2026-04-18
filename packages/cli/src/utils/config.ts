import { loadConfig as internalLoadConfig } from "./keychain.js";
import { HiruConfig } from "shared";

export async function saveConfig(config: HiruConfig) {
  const { saveConfig: internalSaveConfig } = await import("./keychain.js");
  await internalSaveConfig(config);
}

export async function loadConfig(): Promise<HiruConfig | null> {
  const config = await internalLoadConfig();
  if (config) {
    return migrateConfig(config);
  }
  return null;
}

/**
 * Migration helper to ensure old configs match the new OpenClaw-level schema
 */
function migrateConfig(config: any): HiruConfig {
  const defaults: Partial<HiruConfig> = {
    gatewayEnabled: false,
    gatewayPort: 18790,
    voice: {
       enabled: false,
       ttsProvider: 'system',
       sttProvider: 'openai'
    },
    intelligence: {
       enableSelfCritique: true,
       enableProactive: true,
       proactiveEvents: ['error_log', 'test_fail']
    },
    cron: {
       enabled: true,
       timezone: 'UTC'
    }
  };

  // Shallow merge defaults for top-level missing keys
  return { ...defaults, ...config } as HiruConfig;
}
