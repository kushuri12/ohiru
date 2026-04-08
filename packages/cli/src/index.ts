#!/usr/bin/env node
import fetch, { Headers, Request, Response } from "node-fetch";

// Polyfill fetch for environments where it's missing or shadowed (Node <18 or certain bundles)
if (typeof globalThis.fetch !== "function") {
  (globalThis as any).fetch = fetch;
  (globalThis as any).Headers = Headers;
  (globalThis as any).Request = Request;
  (globalThis as any).Response = Response;
}

import { Command } from "commander";
import { checkFirstRun, loadConfig } from "./utils/config.js";
import { HiruAgent } from "./agent/Agent.js";
import { detectProjectContext } from "./context/ProjectAnalyzer.js";
import chalk from "chalk";
import readline from "readline";
import { PROVIDERS } from "./providers/index.js";
import { runSetupWizard } from "./setup/wizard.js";
import { v4 as uuidv4 } from "uuid";
import { listSessions, saveSession, getSession } from "./memory/SessionManager.js";
import { appendHiruMD, readHiruMD, clearHiruMD } from "./memory/HiruMD.js";
import { setupWindowsTerminal, detectTerminalSupport } from "./utils/platform.js";

export const version_cli = "0.1.1";

const program = new Command();

program
  .name("hiru")
  .description("Agentic coding assistant for your terminal")
  .version(version_cli)
  .helpCommand(false)
  .addHelpCommand(false)
  .configureHelp({ showGlobalOptions: false });

program.helpOption(false);

program
  .command("code")
  .description("Starts interactive coding session")
  .option("--resume [id]", "Resume session. If no ID, shows picker.")
  .action(async (options) => {
    const config = await checkFirstRun();
    
    // Self-respawn if memory isn't high enough
    const currentMaxMem = Math.floor(process.memoryUsage().heapTotal / 1024 / 1024);
    const targetMaxMem = config.maxMemoryMB || 4096;
    
    // Node.js doesn't expose the exact --max-old-space-size value easily, 
    // but if we are below target, we just respawn once.
    if (!process.env.HIRU_RESPAWNED && targetMaxMem > 1024) {
      const { spawn } = await import("child_process");
      const args = [
         `--max-old-space-size=${targetMaxMem}`,
         ...process.argv.slice(1)
      ];
      
      const child = spawn(process.argv[0], args, {
        stdio: "inherit",
        env: { ...process.env, HIRU_RESPAWNED: "1" }
      });
      child.on("exit", (code) => process.exit(code || 0));
      return;
    }

    const projectFolder = process.cwd().split(/[\\/]/).pop() || "";
    
    console.clear();
    
    // Condensed Claude-style Header
    const l1 = chalk.hex("#CC785C")("  ▄ ▄  ") + `  ${chalk.white.bold("Hiru Code")} ${chalk.gray("v" + version_cli)}`;
    const l2 = chalk.hex("#CC785C")(" █████ ") + `  ${chalk.gray(config.provider.toUpperCase() + " / " + config.model)}`;
    const l3 = chalk.hex("#CC785C")(" █ █ █ ") + `  ${chalk.gray(process.cwd())}`;

    console.log(`\n${l1}\n${l2}\n${l3}\n`);
    const agent = new HiruAgent(config);
    const ctx = await detectProjectContext(process.cwd());

    let sessionId = options.resume === true ? undefined : options.resume;
    
    if (options.resume === true) {
       const sessions = await listSessions();
       if (sessions.length === 0) {
          console.log(chalk.yellow("No sessions found. Starting new."));
          sessionId = uuidv4();
       } else {
          const { select, isCancel, cancel } = await import("@clack/prompts");
          const choice = await select({
             message: "Select a session to resume:",
             options: sessions.map(s => ({
                value: s.id,
                label: `${s.name}`,
                hint: `${new Date(s.updatedAt).toLocaleString()} • ${s.projectRoot}`
             }))
          });
          if (isCancel(choice)) { cancel("Cancelled."); process.exit(0); }
          sessionId = choice as string;
       }
    } else {
       sessionId = sessionId || uuidv4();
    }

    if (sessionId) {
       const existing = await getSession(sessionId);
       if (existing) {
          agent.messages = JSON.parse(existing.messages);
          agent.tokenUsage = JSON.parse(existing.tokenUsage || '{"prompt":0,"completion":0}');
          console.log(chalk.gray(`Resuming session ${sessionId}...`));
       } else if (options.resume) {
          console.log(chalk.red(`Session ${sessionId} not found. Starting new.`));
          sessionId = uuidv4();
       }
    }

    const { render } = await import("ink");
    const React = await import("react");
    const { TUIWrapper } = await import("./ui/TUIWrapper.js");

    const { waitUntilExit, clear } = render(React.createElement(TUIWrapper as any, { 
      agent, 
      ctx, 
      sessionId, 
      config,
      version: version_cli
    }));
    await waitUntilExit();
    clear();
  });

program
  .command("run <prompt...>")
  .description("Execute a single generation from a prompt")
  .action(async (promptArr) => {
    let prompt = Array.isArray(promptArr) ? promptArr.join(" ") : promptArr;
    const config = await checkFirstRun();
    const agent = new HiruAgent(config);
    const ctx = await detectProjectContext(process.cwd());
    
    agent.on("token", (t) => process.stdout.write(chalk.cyanBright(t)));
    agent.on("toolCall", (c) => console.warn(chalk.yellow(`\n⚙️  Running ${c.toolName}...`)));
    agent.on("status", (s) => console.warn(chalk.gray(`\n⏳ ${s}`)));
    agent.on("error", (e) => console.error(chalk.red(`\n❌ Error: ${e.message || e}`)));
    agent.on("done", () => console.warn(chalk.green(`\n✓ Done.`)));
    
    await agent.runStreaming(prompt, ctx);
    agent.cleanup();
    process.exit(0);
  });

program
  .command("provider [action]")
  .description("Manage providers. 'list' or 'switch'")
  .action(async (action) => {
    if (action === "list") {
      console.log("\nAvailable providers:\n");
      PROVIDERS.forEach(p => {
        console.log(chalk.bold(`${p.icon} ${p.label} (${p.id})`));
        p.models.forEach(m => console.log(`  - ${m.label}`));
      });
      console.log("");
    } else if (action === "switch") {
      await runSetupWizard();
    } else {
      console.log(chalk.yellow("Unknown action. Try 'list' or 'switch'."));
    }
  });

program
  .command("model <action>")
  .description("Manage models. 'switch'")
  .action(async (action) => {
     if (action === "switch") {
       const config = await checkFirstRun();
       const { runModelChangeWizard } = await import("./setup/wizard.js");
       await runModelChangeWizard(config);
     } else {
       console.log(chalk.yellow("Unknown action. Try 'switch'."));
     }
  });

program
  .command("memory [action] [text...]")
  .description("Manage project memory (HIRU.md)")
  .action(async (action, textObj) => {
      let text = (textObj && Array.isArray(textObj)) ? textObj.join(" ") : null;
      const root = process.cwd();
      if (action === "show") {
          console.log(await readHiruMD(root));
      } else if (action === "add" && text) {
          await appendHiruMD(root, text);
          console.log("Added to HIRU.md");
      } else if (action === "clear") {
          await clearHiruMD(root);
          console.log("Memory cleared.");
      } else {
          console.log("Usage: hiru memory show|add|clear [text]");
      }
  });

  program
    .command("sessions [action]")
    .description("Manage past sessions: 'list' or 'clear'")
    .action(async (action) => {
      if (action === "list") {
        const sessions = await listSessions();
        console.log(`\n${chalk.hex("#CC785C").bold("  Past Sessions")}\n`);
        if (sessions.length === 0) {
          console.log(chalk.gray("  No sessions found."));
        } else {
          sessions.forEach((s) => {
            console.log(`  ${chalk.cyan(s.id)} ${chalk.gray("•")} ${chalk.white(s.name)} ${chalk.blackBright("(" + new Date(s.updatedAt).toLocaleString() + ")")}`);
          });
        }
        console.log("");
      } else if (action === "clear") {
        const { confirm, isCancel } = await import("@clack/prompts");
        const ok = await confirm({ message: "Are you sure you want to delete ALL sessions?" });
        if (ok && !isCancel(ok)) {
           const { clearAllSessions } = await import("./memory/SessionManager.js");
           await clearAllSessions();
           console.log(chalk.green("✓ All sessions cleared."));
        }
      } else {
        console.log("Usage: hiru sessions list|clear");
      }
    });

  program
    .command("set-ram <mb>")
  .description("Set permanent RAM limit for Hiru in Megabytes (e.g., 4096)")
  .action(async (mb) => {
      const config = await checkFirstRun();
      const num = parseInt(mb);
      if (isNaN(num)) {
          console.log(chalk.red("Must be a number."));
          return;
      }
      config.maxMemoryMB = num;
      const { saveConfig } = await import("./utils/config.js");
      await saveConfig(config);
      console.log(chalk.green(`✓ RAM limit set to ${num}MB permanently.`));
  });

program
  .command("tele")
  .description("Kontrol PC lewat Telegram")
  .option("--setup", "Setup bot token dan chat ID")
  .action(async (options) => {
    const { teleCommand } = await import("./commands/tele.js");
    await teleCommand(options);
  });

program
  .command("help")
  .description("Show all commands and usage")
  .action(() => {
     const l1 = chalk.hex("#CC785C")("  ▄ ▄  ") + `  ${chalk.gray("")}`;
     const l2 = chalk.hex("#CC785C")(" █████ ") + `  ${chalk.white.bold("Hiru Code")} ${chalk.gray("v" + version_cli)}`;
     const l3 = chalk.hex("#CC785C")(" █ █ █ ") + `  ${chalk.gray("Agentic AI for your terminal")}`;

     console.log(`\n${l1}\n${l2}\n${l3}\n`);
     
     const categories = [
       {
         title: "Core Commands",
         cmds: [
           { c: "code", d: "Start interactive agentic session" },
           { c: "code --resume", d: "Pick and resume a past session" },
           { c: "run <prompt>", d: "Task-focused generation from prompt" },
         ]
       },
       {
         title: "Session & History",
         cmds: [
           { c: "sessions list", d: "View all past session IDs" },
           { c: "sessions clear", d: "Delete all historical sessions" },
         ]
       },
       {
         title: "Project Memory (HIRU.md)",
         cmds: [
           { c: "memory show", d: "View the current project context" },
           { c: "memory add <text>", d: "Write knowledge to project file" },
           { c: "memory clear", d: "Reset project-specific memory" },
         ]
       },
       {
         title: "Remote Control",
         cmds: [
           { c: "tele", d: "Start Telegram remote control bot" },
           { c: "tele --setup", d: "Setup Telegram bot token & chat ID" },
         ]
       },
       {
         title: "Configuration",
         cmds: [
           { c: "set-ram <mb>", d: "Permanently set memory allocation limit" },
           { c: "provider switch", d: "Change AI provider or model" },
           { c: "provider list", d: "See all supported providers/models" },
           { c: "model switch", d: "Quickly change model for current provider" },
         ]
       }
     ];

     categories.forEach(cat => {
       console.log(`  ${chalk.white.bold(cat.title)}`);
       cat.cmds.forEach(({c, d}) => {
         console.log(`    ${chalk.cyan(c.padEnd(18))} ${chalk.gray("•")} ${chalk.white(d)}`);
       });
       console.log("");
     });

     console.log(`  ${chalk.blackBright("Usage: hiru <command> [options]")}\n`);
  });

async function main() {
  // Ensure all directories in ~/.hiru exist
  const { ensureHiruDirs } = await import("./utils/paths.js");
  await ensureHiruDirs();

  // Setup Windows before anything else
  await setupWindowsTerminal();
  const termSupport = detectTerminalSupport();
  if (!termSupport.unicode) {
    process.env.HIRU_ASCII_MODE = "1";
  }

  program.parse(process.argv);
}

if (process.argv[1]?.includes('index.js') || process.argv[1]?.includes('index.ts') || process.argv[1]?.includes('hiru')) {
   main();
}
