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
import { c } from "./ui/theme.js";
import { printStartupBanner, printCompactHeader, divider, statusLine } from "./ui/banner.js";
import { SimpleTUI } from "./ui/SimpleTUI.js";

import ora from "ora";

export const version_cli = "1.3.3";

async function main() {
  await ensureHiruDirs();
  await setupWindowsTerminal();

  const args = process.argv.slice(2);
  const isSetup  = args.includes("--setup") || args.includes("setup");
  const isHelp   = args.includes("--help")  || args.includes("-h") || args.includes("help");
  const isVersion = args.includes("--version") || args.includes("-v");

  // ── version ──────────────────────────────────────────────────────────────
  if (isVersion) {
    console.log(`openhiru v${version_cli}`);
    process.exit(0);
  }

  // ── help ─────────────────────────────────────────────────────────────────
  if (isHelp) {
    printCompactHeader("HELP", version_cli);

    const cmd = (s: string) => c.light(s.padEnd(35));
    const dot  = c.dark("•");

    console.log(`  ${c.muted("Commands")}\n`);
    console.log(`    ${cmd("openhiru")}                ${dot} ${chalk.white("Start the Telegram agent")}`);
    console.log(`    ${cmd("openhiru settings")}           ${dot} ${chalk.white("Open settings popup")}`);
    console.log(`    ${cmd("openhiru gateway <start|stop>")}  ${dot} ${chalk.white("Manage WebSocket gateway")}`);
    console.log(`    ${cmd("openhiru channels <list|add>")}   ${dot} ${chalk.white("Manage channel adapters")}`);
    console.log(`    ${cmd("openhiru agents <list|add|start>")} ${dot} ${chalk.white("Orchestrate multiple agents")}`);
    console.log(`    ${cmd("openhiru dashboard start")}       ${dot} ${chalk.white("Launch web dashboard")}`);
    console.log(`    ${cmd("openhiru canvas open")}           ${dot} ${chalk.white("Open visual workspace")}`);
    console.log(`    ${cmd("openhiru voice start")}           ${dot} ${chalk.white("Enable wake-word listener")}`);
    console.log(`    ${cmd("openhiru doctor")}                ${dot} ${chalk.white("System health check")}`);
    console.log(`    ${cmd("openhiru memory distill")}        ${dot} ${chalk.white("Compress project knowledge")}`);
    console.log(`    ${cmd("openhiru skill prune")}           ${dot} ${chalk.white("Clean old skill versions")}`);
    console.log(`    ${cmd("openhiru logs --follow")}         ${dot} ${chalk.white("Tail agent logs")}`);
    console.log(`    ${cmd("openhiru --setup")}               ${dot} ${chalk.white("Configure bot credentials")}`);
    console.log(`    ${cmd("openhiru --version")}             ${dot} ${chalk.white("Show version")}`);
    console.log(`    ${cmd("openhiru --help")}                ${dot} ${chalk.white("Show this help menu")}`);
    console.log("");
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
    console.log(`  ${c.muted("⚠️")}  ${c.muted("Telegram bot is not configured.")}`);
    console.log(chalk.dim("     Run: ") + c.light("openhiru --setup\n"));
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
        console.log(`\n  ${c.muted("Available providers")}\n`);
        PROVIDERS.forEach(p => {
          console.log(`  ${p.icon}  ${c.bold(p.label)} ${c.dark(`(${p.id})`)}`);
          p.models.forEach(m => console.log(`     ${c.muted("●")} ${chalk.white(m.label)}`));
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
      } else if (subCmd === "distill") {
          const { MemoryDistiller } = await import("./memory/MemoryDistiller.js");
          const distiller = new MemoryDistiller({ chat: async () => "Summary" } as any);
          await distiller.distill();
      } else {
          console.log("Usage: openhiru memory <show|add|clear|distill> [text]");
      }
      process.exit(0);
    } else if (cmd === "sessions") {
      const { listSessions, clearAllSessions } = await import("./memory/SessionManager.js");
      if (subCmd === "list") {
        const sessions = await listSessions();
        printCompactHeader("SESSIONS", version_cli);
        if (sessions.length === 0) {
          console.log(chalk.gray("  No sessions found."));
        } else {
          sessions.forEach((s: any) => {
             console.log(`  ${c.light(s.id)} ${c.dark("•")} ${chalk.white(s.name)} ${chalk.dim("(" + new Date(s.updatedAt).toLocaleString() + ")")}`);
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
        console.log("Usage: openhiru sessions <list|clear>");
      }
      process.exit(0);
    } else if (cmd === "skill") {
      const { SkillManager } = await import("./skills/SkillManager.js");
      const sm = new SkillManager();
      await sm.init();
      if (subCmd === "list") {
        const skills = sm.listSkills();
        printCompactHeader("SKILLS", version_cli);
        if (skills.length === 0) console.log(c.muted("  No skills installed."));
        else {
          skills.forEach((s: any) => {
             const testTag = s.testResult ? (s.testResult.success ? c.green("✅") : c.red("❌")) : c.muted("⚠️");
             console.log(`  ${testTag} ${c.light(s.name)} ${c.dark("[")}${chalk.dim(s.main || "unknown")}${c.dark("]")} ${chalk.dim(`(v${s.version})`)}`);
             console.log(`     ${chalk.dim(s.description)}`);
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
      } else if (subCmd === "prune") {
         const dryRun = args.includes("--dry-run");
         const result = await sm.pruneOldVersions(dryRun);
         const mode = dryRun ? "Dry-run" : "Prune";
         console.log(`  ${c.glow("●")}  ${c.light(`${mode} summary:`)}`);
         console.log(`     ${c.muted("deleted:")} ${chalk.white(result.deleted.length)}`);
         console.log(`     ${c.muted("kept:   ")} ${chalk.white(result.kept.length)}`);
         if (result.deleted.length > 0) {
           console.log(chalk.dim(`     files: ${result.deleted.join(", ")}`));
         }
      } else {
        console.log("Usage: openhiru skill <list|create|delete|test|prune> [name] [json_args] [--dry-run]");
      }
      process.exit(0);
    } else if (cmd === "plugin") {
      const { PluginManager } = await import("./plugins/PluginManager.js");
      const pm = new PluginManager();
      await pm.init();
      pm.on("status", (msg: string) => console.log(chalk.gray(msg)));
      
      const source = args.slice(2).join(" ");
      if (subCmd === "install" && source) {
        console.log(`  ${c.glow("📥")}  ${c.muted("Plugin          ")}${chalk.white(`Installing from ${source}...`)}`);
        const res = await pm.install(source);
        if (res.success) console.log(`  ${c.green("✓")}  ${c.muted("Plugin          ")}${c.green(`"${res.name}" installed!`)}`);
        else console.log(`  ${c.red("✗")}  ${c.muted("Plugin          ")}${c.red(`Install failed: ${res.error}`)}`);
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
        printCompactHeader("PLUGINS", version_cli);
        if (plugins.length === 0) {
          console.log(c.muted("  No plugins installed."));
        } else {
          plugins.forEach((p: any) => {
             const status = p.status === "active" ? c.green("✅") : p.status === "disabled" ? c.glow("⏸️") : c.red("❌");
             console.log(`  ${status} ${c.light(p.name)} ${chalk.dim(`v${p.version}`)} ${c.dark("[")}${chalk.dim(p.format)}${c.dark("]")}`);
             console.log(`     ${chalk.dim(p.description)}`);
          });
          console.log("");
        }
      } else {
        console.log(`  ${c.muted("Usage:")} openhiru plugin <install|uninstall|update|enable|disable|list> [target]`);
      }
      process.exit(0);
    } else if (cmd === "gateway") {
      const { GatewayServer } = await import("@ohiru/gateway");
      const server = new GatewayServer({ port: config.gatewayPort || 18790 });
      if (subCmd === "start") await server.start();
      else if (subCmd === "stop") { await server.stop(); process.exit(0); }
      // Keep alive for start
    } else if (cmd === "dashboard") {
      const { DashboardServer } = await import("@ohiru/dashboard");
      const server = new DashboardServer(config.dashboard?.port || 3792);
      await server.start();
      // Keep alive
    } else if (cmd === "canvas") {
      const { CanvasServer } = await import("@ohiru/canvas");
      const server = new CanvasServer(config.canvas?.port || 3791);
      await server.start();
      // Keep alive
    } else if (cmd === "agents") {
      const { handleAgentsCommand } = await import("@ohiru/agents/cli/AgentsCLI.js");
      await handleAgentsCommand(args.slice(1));
      process.exit(0);
    } else if (cmd === "channels") {
      const { ChannelManager } = await import("@ohiru/channels");
      const cm = new ChannelManager();
      if (subCmd === "list") {
        const status = cm.getStatus();
        console.table(status);
      }
      process.exit(0);
    } else if (cmd === "voice") {
       const { VoiceSession } = await import("@ohiru/voice");
       // Mock agent for voice session
       const vs = new VoiceSession({ chat: async (t: string) => "I heard you." } as any, {} as any, {} as any, {} as any);
       await vs.start();
       // Keep alive
    } else if (cmd === "cron") {
       const { CronManager } = await import("./cron/CronManager.js");
       const core = new CronManager({} as any);
       if (subCmd === "list") {
         console.table(core.listTasks());
       }
       process.exit(0);
    } else if (cmd === "logs") {
       console.log("Streaming logs...");
       process.exit(0);
    } else if (cmd === "doctor") {
      const { handleDoctorCommand } = await import("./commands/doctor.js");
      await handleDoctorCommand();
      process.exit(0);
    } else if (cmd === "settings") {
      const ui = new SimpleTUI(config, version_cli);
      ui.openSettings();
      ui.onConfigChange = async (newCfg) => {
          config = newCfg;
      };
      // Keep it running for the modal
      ui.start();
      return; 
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
      console.log(`  ${c.muted("⚠️")}  ${c.muted(`Unknown command '${cmd}'. Use`)} ${c.light("openhiru --help")} ${c.muted("for usage information.")}`);
      process.exit(1);
    }
  }

  // ── start bot ─────────────────────────────────────────────────────────────
  const ctx = await detectProjectContext(process.cwd());

  const ui = new SimpleTUI(config, version_cli);
  
  // Monkey-patch console to prevent breaking the TUI
  console.log = (...args) => ui.info(args.join(" ").replace(/\u001b\[[0-9;]*m/g, ""));
  console.warn = (...args) => ui.warn(args.join(" ").replace(/\u001b\[[0-9;]*m/g, ""));
  console.error = (...args) => ui.error(args.join(" ").replace(/\u001b\[[0-9;]*m/g, ""));
  console.info = (...args) => ui.info(args.join(" ").replace(/\u001b\[[0-9;]*m/g, ""));

  ui.setProvider(config.provider);
  ui.setModel(config.model);
  ui.onConfigChange = (newCfg) => {
    agent.updateConfig(newCfg);
  };
  ui.start();
  ui.success("started", "init");
  ui.info(`cwd: ${ctx.root}`, "init");
  ui.info("loading skills...", "init");
  
  const sessionId = "telegram-session";
  const { getSession } = await import("./memory/SessionManager.js");
  const agent = new HiruAgent({ ...config, telegramMode: true } as any, sessionId);

  await agent.waitReady();
  
  const skillCount = Object.keys((agent as any).tools).filter(k => k.startsWith("skill_")).length;
  ui.setSkillsCount(skillCount);
  ui.setStatus("active");
  ui.success(`loaded ${skillCount} skills`, "skills");
  ui.success("heartbeat active", "heartbeat");
  ui.success("ready for messages", "status");

  // Start Heartbeat
  const { HeartbeatManager } = await import("./agent/Heartbeat.js");
  const heartbeat = new HeartbeatManager(agent, ctx, { intervalMs: 30 * 60 * 1000, enabled: true });
  heartbeat.start();

  const bridge = new TelegramBridge(agent, ctx, {
    botToken: config.telegramBotToken!,
    allowedChatId: config.telegramAllowedChatId!,
  });

  const existing = await getSession(sessionId);
  if (existing) {
    agent.messages = JSON.parse(existing.messages);
    agent.tokenUsage = JSON.parse(existing.tokenUsage || '{"prompt":0,"completion":0}');
    agent.sanitizeMessages();
    ui.setTokens(agent.tokenUsage.prompt + agent.tokenUsage.completion);
    ui.info(`restored ${agent.messages.length} messages`, "restore");
  }

  await agent.waitReady();

  process.on("SIGINT", async () => {
    ui.setStatus("idle");
    ui.info("shutting down...", "shutdown");
    await bridge.stop();
    agent.cleanup();
    ui.stop();
    process.exit(0);
  });

  await bridge.start();
}

main().catch((e) => {
  console.error(chalk.red(`\n❌ Fatal Analysis: ${e?.message || e}\n`));
  process.exit(1);
});
