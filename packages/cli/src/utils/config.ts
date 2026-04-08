import { loadConfig as internalLoadConfig } from "./keychain.js";
import { runSetupWizard } from "../setup/wizard.js";
import { HiruConfig } from "shared";

export async function saveConfig(config: HiruConfig) {
  const { saveConfig: internalSaveConfig } = await import("./keychain.js");
  await internalSaveConfig(config);
}

export async function loadConfig(): Promise<HiruConfig | null> {
  return await internalLoadConfig();
}

export async function checkFirstRun(): Promise<HiruConfig> {
  let cfg = await loadConfig();
  if (!cfg) {
    cfg = await runSetupWizard();
  }
  return cfg;
}
