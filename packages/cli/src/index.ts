#!/usr/bin/env node
import fetch, { Headers, Request, Response } from "node-fetch";

// Polyfill fetch for environments where it's missing (Node <18 / certain bundles)
if (typeof globalThis.fetch !== "function") {
  (globalThis as any).fetch = fetch;
  (globalThis as any).Headers = Headers;
  (globalThis as any).Request = Request;
  (globalThis as any).Response = Response;
}

import chalk from "chalk";
import { loadConfig, saveConfig } from "./utils/config.js";
import { HiruAgent } from "./agent/Agent.js";
import { detectProjectContext } from "./context/ProjectAnalyzer.js";
import { TelegramBridge } from "./telegram/TelegramBridge.js";
import { runTelegramSetup } from "./telegram/TelegramSetup.js";
import { ensureHiruDirs } from "./utils/paths.js";
import { setupWindowsTerminal } from "./utils/platform.js";

export const version_cli = "0.1.3";

async function main() {
  await ensureHiruDirs();
  await setupWindowsTerminal();

  const args = process.argv.slice(2);
  const isSetup  = args.includes("--setup") || args.includes("setup");
  const isHelp   = args.includes("--help")  || args.includes("-h") || args.includes("help");
  const isVersion = args.includes("--version") || args.includes("-v");

  // ── version ──────────────────────────────────────────────────────────────
  if (isVersion) {
    console.log(`hiru v${version_cli}`);
    process.exit(0);
  }

  // ── help ─────────────────────────────────────────────────────────────────
  if (isHelp) {
    const l1 = chalk.hex("#CC785C")("  ▄ ▄  ") + `  ${chalk.white.bold("Hiru")} ${chalk.gray("v" + version_cli)}`;
    const l2 = chalk.hex("#CC785C")(" █████ ") + `  ${chalk.gray("Telegram AI Agent")}`;
    const l3 = chalk.hex("#CC785C")(" █ █ █ ") + `  ${chalk.gray("github.com/kushuri12/ohiru")}`;
    console.log(`\n${l1}\n${l2}\n${l3}\n`);
    console.log(`  ${chalk.white.bold("Usage:")}\n`);
    console.log(`    ${chalk.cyan("hiru")}                           ${chalk.gray("•")} ${chalk.white("Start the Telegram agent")}`);
    console.log(`    ${chalk.cyan("hiru --setup")}                   ${chalk.gray("•")} ${chalk.white("Configure bot credentials")}`);
    console.log(`    ${chalk.cyan("hiru provider <list|switch>")}  ${chalk.gray("•")} ${chalk.white("Manage AI providers")}`);
    console.log(`    ${chalk.cyan("hiru model switch")}            ${chalk.gray("•")} ${chalk.white("Switch current AI model")}`);
    console.log(`    ${chalk.cyan("hiru memory <show|add|clear>")} ${chalk.gray("•")} ${chalk.white("Manage project memory (HIRU.md)")}`);
    console.log(`    ${chalk.cyan("hiru sessions <list|clear>")}   ${chalk.gray("•")} ${chalk.white("Manage session history")}`);
    console.log(`    ${chalk.cyan("hiru skill <list|create|delete|test>")} ${chalk.gray("•")} ${chalk.white("Manage custom skills")}`);
    console.log(`    ${chalk.cyan("hiru plugin <install|uninstall|update|enable|disable|list>")} ${chalk.gray("•")} ${chalk.white("Manage global plugins")}`);
    console.log(`    ${chalk.cyan("hiru set-ram <mb>")}            ${chalk.gray("•")} ${chalk.white("Set agent memory allocation (e.g. 4096)")}`);
    console.log(`    ${chalk.cyan("hiru --version")}                 ${chalk.gray("•")} ${chalk.white("Show version")}`);
    console.log(`    ${chalk.cyan("hiru --help")}                    ${chalk.gray("•")} ${chalk.white("Show this help menu")}\n`);
    process.exit(0);
  }

  // ── load config ───────────────────────────────────────────────────────────
  let config = await loadConfig();

  // ── setup wizard ──────────────────────────────────────────────────────────
  if (isSetup || !config) {
    if (!config) {
      // First run: need AI provider config first
      const { runSetupWizard } = await import("./setup/wizard.js");
      config = await runSetupWizard();
    }
    config = await runTelegramSetup(config);
    process.exit(0);
  }

  // ── must have telegram creds ──────────────────────────────────────────────
  if (!config.telegramBotToken || !config.telegramAllowedChatId) {
    console.log(chalk.yellow("\n⚠️  Telegram bot is not configured."));
    console.log(chalk.gray("   Run: ") + chalk.cyan("hiru --setup\n"));
    process.exit(1);
  }

  // ── self-respawn for memory limit ─────────────────────────────────────────
  const targetMaxMem = (config as any).maxMemoryMB || 4096;
  if (!process.env.HIRU_RESPAWNED && targetMaxMem > 1024) {
    const { spawn } = await import("child_process");
    const child = spawn(process.argv[0], [
      `--max-old-space-size=${targetMaxMem}`,
      ...process.argv.slice(1),
    ], {
      stdio: "inherit",
      env: { ...process.env, HIRU_RESPAWNED: "1" },
    });
    child.on("exit", (code) => process.exit(code || 0));
    return;
  }

  // ── simple commands handler ───────────────────────────────────────────────
  if (args.length > 0 && !isSetup && !isHelp && !isVersion) {
    const root = process.cwd();
    const cmd = args[0];
    const subCmd = args[1];

    if (cmd === "provider") {
      if (subCmd === "list") {
        const { PROVIDERS } = await import("./providers/index.js");
        console.log("\nAvailable providers:\n");
        PROVIDERS.forEach(p => {
          console.log(chalk.bold(`${p.icon} ${p.label} (${p.id})`));
          p.models.forEach(m => console.log(`  - ${m.label}`));
        });
        console.log("");
        process.exit(0);
      } else if (subCmd === "switch") {
        const { runSetupWizard } = await import("./setup/wizard.js");
        await runSetupWizard();
        process.exit(0);
      }
    } else if (cmd === "model" && subCmd === "switch") {
      const { runModelChangeWizard } = await import("./setup/wizard.js");
      await runModelChangeWizard(config);
      process.exit(0);
    } else if (cmd === "memory") {
      const { readHiruMD, appendHiruMD, clearHiruMD } = await import("./memory/HiruMD.js");
      if (subCmd === "show") {
          console.log(await readHiruMD(root));
      } else if (subCmd === "add" && args[2]) {
          await appendHiruMD(root, args.slice(2).join(" "));
          console.log("Added to project memory (HIRU.md).");
      } else if (subCmd === "clear") {
          await clearHiruMD(root);
          console.log("Project memory cleared.");
      } else {
          console.log("Usage: hiru memory <show|add|clear> [text]");
      }
      process.exit(0);
    } else if (cmd === "sessions") {
      const { listSessions, clearAllSessions } = await import("./memory/SessionManager.js");
      if (subCmd === "list") {
        const sessions = await listSessions();
        console.log(`\n${chalk.hex("#CC785C").bold("  Past Sessions")}\n`);
        if (sessions.length === 0) {
          console.log(chalk.gray("  No sessions found."));
        } else {
          sessions.forEach((s: any) => {
             console.log(`  ${chalk.cyan(s.id)} ${chalk.gray("•")} ${chalk.white(s.name)} ${chalk.blackBright("(" + new Date(s.updatedAt).toLocaleString() + ")")}`);
          });
        }
        console.log("");
      } else if (subCmd === "clear") {
         const { confirm, isCancel } = await import("@clack/prompts");
         const ok = await confirm({ message: "Are you sure you want to delete ALL sessions?" });
         if (ok && !isCancel(ok)) {
            await clearAllSessions();
            console.log(chalk.green("✓ All sessions cleared."));
         }
      } else {
        console.log("Usage: hiru sessions <list|clear>");
      }
      process.exit(0);
    } else if (cmd === "skill") {
      const { SkillManager } = await import("./skills/SkillManager.js");
      const sm = new SkillManager();
      await sm.init();
      if (subCmd === "list") {
        const skills = sm.listSkills();
        if (skills.length === 0) console.log(chalk.yellow("No skills installed."));
        else {
          console.log(`\n${chalk.hex("#CC785C").bold("  Installed Skills")}\n`);
          skills.forEach((s: any) => {
             const testTag = s.testResult ? (s.testResult.success ? chalk.green("✅") : chalk.red("❌")) : chalk.yellow("⚠️");
             console.log(`  ${testTag} ${chalk.cyan(s.name)} [${chalk.gray(s.main || 'unknown')}] (v${s.version})`);
             console.log(`     ${chalk.gray(s.description)}`);
          });
          console.log("");
        }
      } else if (subCmd === "create" && args[2]) {
         console.log(chalk.green(`📂 Skill directory is: ${sm.dir}`));
         console.log(`To create manually, make a folder named "${args[2]}" there.`);
      } else if (subCmd === "delete" && args[2]) {
         await sm.deleteSkill(args[2]);
         console.log(chalk.green(`🗑️ Skill "${args[2]}" deleted.`));
      } else if (subCmd === "test" && args[2]) {
         let testArgs = {};
         if (args.length > 3) {
            try { testArgs = JSON.parse(args.slice(3).join(" ")); } catch { 
               console.log(chalk.red("Args must be valid JSON")); 
               process.exit(1); 
            }
         }
         const res = await sm.testSkill(args[2], testArgs);
         if (res.success) {
            console.log(chalk.green(`✅ Test passed!\nOutput:\n${res.output}`));
         } else {
            console.log(chalk.red(`❌ Test failed:\n${res.output}`));
         }
      } else {
        console.log("Usage: hiru skill <list|create|delete|test> [name] [json_args]");
      }
      process.exit(0);
    } else if (cmd === "plugin") {
      const { PluginManager } = await import("./plugins/PluginManager.js");
      const pm = new PluginManager();
      await pm.init();
      pm.on("status", (msg: string) => console.log(chalk.gray(msg)));
      
      const source = args.slice(2).join(" ");
      if (subCmd === "install" && source) {
        console.log(chalk.cyan(`Installing plugin from ${source}...`));
        const res = await pm.install(source);
        if (res.success) console.log(chalk.green(`✅ Plugin "${res.name}" installed!`));
        else console.log(chalk.red(`❌ Install failed: ${res.error}`));
      } else if (subCmd === "uninstall" && source) {
        const res = await pm.uninstall(source);
        if (res.success) console.log(chalk.green(`🗑️ Plugin "${source}" uninstalled.`));
        else console.log(chalk.red(`❌ Uninstall failed: ${res.error}`));
      } else if (subCmd === "update" && source) {
        const res = await pm.update(source);
        if (res.success) console.log(chalk.green(`🔄 Plugin "${source}" updated.`));
        else console.log(chalk.red(`❌ Update failed: ${res.error}`));
      } else if (subCmd === "enable" && source) {
        const ok = await pm.enable(source);
        if (ok) console.log(chalk.green(`✅ Plugin "${source}" enabled.`));
        else console.log(chalk.red(`❌ Plugin "${source}" not found.`));
      } else if (subCmd === "disable" && source) {
        const ok = await pm.disable(source);
        if (ok) console.log(chalk.green(`⏸️ Plugin "${source}" disabled.`));
        else console.log(chalk.red(`❌ Plugin "${source}" not found.`));
      } else if (subCmd === "list") {
        const plugins = pm.listPlugins();
        if (plugins.length === 0) {
          console.log(chalk.yellow("No plugins installed."));
        } else {
          console.log(`\n${chalk.hex("#CC785C").bold("  Installed Plugins")}\n`);
          plugins.forEach((p: any) => {
             const status = p.status === "active" ? chalk.green("✅") : p.status === "disabled" ? chalk.yellow("⏸️") : chalk.red("❌");
             console.log(`  ${status} ${chalk.cyan(p.name)} v${p.version} [${chalk.gray(p.format)}]`);
             console.log(`     ${chalk.gray(p.description)}`);
          });
          console.log("");
        }
      } else {
        console.log("Usage: hiru plugin <install|uninstall|update|enable|disable|list> [target]");
      }
      process.exit(0);
    } else if (cmd === "set-ram") {
      const num = parseInt(subCmd);
      if (isNaN(num)) {
          console.log(chalk.red("Must be a valid number of Megabytes."));
          process.exit(1);
      }
      config.maxMemoryMB = num;
      await saveConfig(config);
      console.log(chalk.green(`✓ RAM limit set to ${num}MB permanently.`));
      process.exit(0);
    } else {
      console.log(chalk.yellow(`Unknown command '${cmd}'. Use hiru --help for usage information.`));
      process.exit(1);
    }
  }

  // ── start bot ─────────────────────────────────────────────────────────────
  const ctx = await detectProjectContext(process.cwd());

  console.clear();
  const l1 = chalk.hex("#CC785C")("  ▄ ▄  ") + `  ${chalk.white.bold("Hiru")} ${chalk.gray("v" + version_cli + " — Telegram Mode")}`;
  const l2 = chalk.hex("#CC785C")(" █████ ") + `  ${chalk.gray(config.provider.toUpperCase() + " / " + config.model)}`;
  const l3 = chalk.hex("#CC785C")(" █ █ █ ") + `  ${chalk.gray(ctx.root)}`;
  console.log(`\n${l1}\n${l2}\n${l3}\n`);
  console.log(chalk.green("  ✓ Agent deployed successfully. Listening for commands via Telegram."));
  console.log(chalk.gray("  Press Ctrl+C to terminate the bot\n"));

  const sessionId = "telegram-session";
  const { getSession } = await import("./memory/SessionManager.js");
  const agent = new HiruAgent({ ...config, telegramMode: true } as any, sessionId);

  await agent.waitReady();

  const existing = await getSession(sessionId);
  if (existing) {
    agent.messages = JSON.parse(existing.messages);
    agent.tokenUsage = JSON.parse(existing.tokenUsage || '{"prompt":0,"completion":0}');
    console.log(chalk.gray(`  ✓ Restored context footprint (${agent.messages.length} messages).`));
  }

  const bridge = new TelegramBridge(agent, ctx, {
    botToken: config.telegramBotToken!,
    allowedChatId: config.telegramAllowedChatId!,
  });

  process.on("SIGINT", async () => {
    console.log(chalk.gray("\n  Suspending agent process..."));
    await bridge.stop();
    agent.cleanup();
    process.exit(0);
  });

  await bridge.start();
}

main().catch((e) => {
  console.error(chalk.red(`\n❌ Fatal Analysis: ${e?.message || e}\n`));
  process.exit(1);
});
