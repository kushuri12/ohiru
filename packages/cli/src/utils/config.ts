import { loadConfig as internalLoadConfig } from "./keychain.js";
import { HiruConfig } from "shared";

export async function saveConfig(config: HiruConfig) {
  const { saveConfig: internalSaveConfig } = await import("./keychain.js");
  await internalSaveConfig(config);
}

export async function loadConfig(): Promise<HiruConfig | null> {
  return await internalLoadConfig();
}
