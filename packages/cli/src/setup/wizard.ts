import * as p from "@clack/prompts";
import chalk from "chalk";
import { PROVIDERS, getProvider } from "../providers/index.js";
import { saveConfig } from "../utils/config.js";
import { HiruConfig } from "shared";

const theme = { accent: "#CC785C" };

function formatModelHint(m: any): string {
  const price = m.inputPricePerM === 0 ? "FREE" : `$${m.inputPricePerM}/M in`;
  const ctx = m.contextWindow >= 1_000_000 
     ? `${(m.contextWindow/1_000_000).toFixed(1)}M ctx`
     : `${Math.round(m.contextWindow/1000)}k ctx`;
  return chalk.dim(`${price} • ${ctx} • ${m.note || ''}`);
}

export async function runSetupWizard(): Promise<HiruConfig> {
  // Load existing config to preserve other settings (like Telegram)
  const { loadConfig } = await import("../utils/config.js");
  const existingConfig = await loadConfig();

  console.clear();
  console.log("");
  console.log(chalk.hex(theme.accent).bold("  ██╗  ██╗██╗██████╗ ██╗   ██╗"));
  console.log(chalk.hex(theme.accent).bold("  ██║  ██║██║██╔══██╗██║   ██║"));
  console.log(chalk.hex(theme.accent).bold("  ███████║██║██████╔╝██║   ██║"));
  console.log(chalk.hex(theme.accent).bold("  ██╔══██║██║██╔══██╗██║   ██║"));
  console.log(chalk.hex(theme.accent).bold("  ██║  ██║██║██║  ██║╚██████╔╝"));
  console.log(chalk.hex(theme.accent).bold("  ╚═╝  ╚═╝╚═╝╚═╝  ╚═╝ ╚═════╝ "));
  console.log("");
  console.log(chalk.bold("  hiru code  — agentic coding CLI"));
  console.log(chalk.dim("  ─────────────────────────────────"));
  console.log("");

  p.intro(chalk.bgHex(theme.accent).black(existingConfig ? " Provider Switch " : " Initial Setup "));

  const providerGroup = await p.group(
    {
      providerId: () =>
        p.select({
          message: "Select the AI provider you want to use:",
          initialValue: existingConfig?.provider,
          options: PROVIDERS.map((p) => ({
            value: p.id,
            label: `${p.icon}  ${p.label}`,
            hint: p.description,
          })),
        }),
    },
    {
      onCancel: () => {
        p.cancel("Setup cancelled.");
        process.exit(0);
      },
    }
  );

  const provider = getProvider(providerGroup.providerId as string);

  const configParams: any = {
    providerId: providerGroup.providerId,
  };

  if (provider.needsBaseUrl) {
     const baseUrlRes = await p.text({
       message: `Base URL for ${provider.label}:`,
       placeholder: provider.id === 'ollama' ? 'http://localhost:11434/api' : 'https://api.openai.com/v1',
       initialValue: (existingConfig?.provider === providerGroup.providerId && existingConfig?.baseUrl) 
                      ? existingConfig?.baseUrl 
                      : undefined,
     });
     if (p.isCancel(baseUrlRes)) { p.cancel("Setup cancelled."); process.exit(0); }
     configParams.baseUrl = baseUrlRes;
  }

  // Model Selection
  if (provider.models.length > 0) {
    const defaultModels = provider.models.map(m => ({
        value: m.id,
        label: m.label,
        hint: formatModelHint(m)
    }));

    if (provider.supportsCustomModel) {
        defaultModels.push({
            value: "custom",
            label: "Other (Type custom model ID)",
            hint: "Manually enter model name"
        });
    }

    const modelSelect = await p.select({
       message: "Select a model:",
       initialValue: existingConfig?.provider === providerGroup.providerId ? existingConfig?.model : undefined,
       options: defaultModels
    });
    
    if (p.isCancel(modelSelect)) { p.cancel("Setup cancelled."); process.exit(0); }

    if (modelSelect === "custom") {
       const customModel = await p.text({
          message: "Enter custom model ID (e.g. gpt-4-turbo):",
          validate: (val) => val.trim() === "" ? "Model ID cannot be empty" : undefined
       });
       if (p.isCancel(customModel)) { p.cancel("Setup cancelled."); process.exit(0); }
       configParams.modelId = customModel;
    } else {
       configParams.modelId = modelSelect;
    }
  } else {
      const customModel = await p.text({
          message: "Enter model ID:",
          validate: (val) => val.trim() === "" ? "Model ID cannot be empty" : undefined
      });
      if (p.isCancel(customModel)) { p.cancel("Setup cancelled."); process.exit(0); }
      configParams.modelId = customModel;
  }

  // API Key Setup
  if (provider.apiKeyEnv) {
      const apiKeyRes = await p.password({
          message: `Enter your ${provider.apiKeyLabel}:`,
          mask: "●",
      });
      if (p.isCancel(apiKeyRes)) { p.cancel("Setup cancelled."); process.exit(0); }
      configParams.apiKey = apiKeyRes;

      if (apiKeyRes && apiKeyRes.length > 5) {
          const isGlobal = await p.confirm({
              message: "Do you want to use this key as a Global Default for all providers?",
              initialValue: false
          });
          if (isGlobal && !p.isCancel(isGlobal)) {
              const { saveGlobalApiKey } = await import("../utils/keychain.js");
              await saveGlobalApiKey(apiKeyRes);
          }
      }
  }

  const s = p.spinner();
  s.start("Saving configuration securely in your system keychain...");
  
  const finalConfig: HiruConfig = {
      ...(existingConfig || {}), // Start with existing config
      provider: configParams.providerId,
      model: configParams.modelId,
      apiKey: configParams.apiKey || "dummy",
      baseUrl: configParams.baseUrl,
      temperature: existingConfig?.temperature ?? 0,
      permission: existingConfig?.permission ?? "ask"
  };

  await saveConfig(finalConfig);

  s.stop("Configuration saved.");

  p.outro(chalk.green(`✨ Setup complete! ${existingConfig ? "Provider switched." : "Ready to code."}`));

  return finalConfig;
}

export async function runModelChangeWizard(currentConfig: HiruConfig): Promise<HiruConfig> {
  console.clear();
  p.intro(chalk.bgHex(theme.accent).black(` Change Model (${currentConfig.provider.toUpperCase()}) `));

  const provider = getProvider(currentConfig.provider);

  if (!provider) {
    p.cancel(`Provider ${currentConfig.provider} not found.`);
    process.exit(1);
  }

  let newModelId = currentConfig.model || "";

  if (provider.models.length > 0) {
    const defaultModels = provider.models.map(m => ({
        value: m.id,
        label: m.label,
        hint: formatModelHint(m)
    }));

    if (provider.supportsCustomModel) {
        defaultModels.push({
            value: "custom",
            label: "Other (Type custom model ID)",
            hint: "Manually enter model name"
        });
    }

    const modelSelect = await p.select({
       message: "Select a model:",
       options: defaultModels
    });
    
    if (p.isCancel(modelSelect)) { p.cancel("Cancelled."); process.exit(0); }

    if (modelSelect === "custom") {
       const customModel = await p.text({
          message: "Enter custom model ID (e.g. gpt-4-turbo):",
          validate: (val) => val.trim() === "" ? "Model ID cannot be empty" : undefined
       });
       if (p.isCancel(customModel)) { p.cancel("Cancelled."); process.exit(0); }
       newModelId = customModel;
    } else {
       newModelId = modelSelect as string;
    }
  } else {
      const customModel = await p.text({
          message: "Enter model ID:",
          validate: (val) => val.trim() === "" ? "Model ID cannot be empty" : undefined
      });
      if (p.isCancel(customModel)) { p.cancel("Cancelled."); process.exit(0); }
      newModelId = customModel;
  }

  const updatedConfig: HiruConfig = {
      ...currentConfig,
      model: newModelId
  };

  await saveConfig(updatedConfig);
  p.outro(chalk.green(`✨ Model updated to ${newModelId}.`));

  return updatedConfig;
}
