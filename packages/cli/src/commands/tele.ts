// src/commands/tele.ts
import chalk from "chalk";
import { checkFirstRun } from "../utils/config.js";
import { HiruAgent } from "../agent/Agent.js";
import { detectProjectContext } from "../context/ProjectAnalyzer.js";
import { TelegramBridge } from "../telegram/TelegramBridge.js";
import { runTelegramSetup } from "../telegram/TelegramSetup.js";
import { version_cli } from "../index.js";

export async function teleCommand(options: { setup?: boolean }) {
  const config = await checkFirstRun();

  if (options.setup || !config.telegramBotToken || !config.telegramAllowedChatId) {
    await runTelegramSetup(config);
    return;
  }

  const ctx = await detectProjectContext(process.cwd());

  console.clear();
  console.log(chalk.hex("#CC785C")("\n  ▄ ▄   ") + chalk.bold.white("Hiru") + chalk.gray(" — Telegram Mode"));
  console.log(chalk.hex("#CC785C")(" █████  ") + chalk.gray(config.provider.toUpperCase() + " / " + config.model));
  console.log(chalk.hex("#CC785C")(" █ █ █  ") + chalk.gray(ctx.root));
  console.log();
  console.log(chalk.green("  ✓ Bot aktif. Kirim perintah dari Telegram."));
  console.log(chalk.gray("  Ctrl+C untuk berhenti\n"));

  const sessionId = "telegram-session";
  const { getSession } = await import("../memory/SessionManager.js");
  const agent = new HiruAgent(config, sessionId);

  // Restore history for the agent
  const existing = await getSession(sessionId);
  if (existing) {
    agent.messages = JSON.parse(existing.messages);
    agent.tokenUsage = JSON.parse(existing.tokenUsage || '{"prompt":0,"completion":0}');
    console.log(chalk.gray(`  ✓ Memuat riwayat chat sebelumnya (${agent.messages.length} pesan).`));
  }

  const bridge = new TelegramBridge(agent, ctx, {
    botToken: config.telegramBotToken,
    allowedChatId: config.telegramAllowedChatId,
  });

  process.on("SIGINT", async () => {
    console.log(chalk.gray("\n  Menghentikan bot..."));
    await bridge.stop();
    agent.cleanup();
    process.exit(0);
  });

  await bridge.start();
}
