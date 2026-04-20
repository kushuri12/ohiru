// src/telegram/TelegramSetup.ts
import chalk from "chalk";
import { c } from "../ui/theme.js";
import { printCompactHeader } from "../ui/banner.js";

export async function runTelegramSetup(config: any): Promise<any> {
  const { text, password, isCancel, cancel, intro, outro, spinner } =
    await import("@clack/prompts");

  console.clear();
  printCompactHeader("TELEGRAM SETUP", "1.0.0");
  intro(c.label(" Setup Telegram Bot "));

  console.log(chalk.dim(`
  Instructions:
  1. Open Telegram → search for @BotFather
  2. Send /newbot → follow instructions → copy token
  3. Send any message to your newly created bot
  4. Visit: https://api.telegram.org/bot<TOKEN>/getUpdates
  5. Copy the number from "chat":{"id": THIS_NUMBER}
  `));

  const botToken = await password({
    message: "Bot Token from @BotFather:",
    validate: (v: string) => (!v || !v.includes(":")) ? "Invalid token format" : undefined,
  });
  if (isCancel(botToken)) { cancel("Setup aborted."); process.exit(0); }

  const chatId = await text({
    message: "Your Chat ID (number from getUpdates):",
    placeholder: "1234567890",
    validate: (v: string) => (!v || isNaN(Number(v))) ? "Must be a number" : undefined,
  });
  if (isCancel(chatId)) { cancel("Setup aborted."); process.exit(0); }

  // Connection Test
  const s = spinner();
  s.start("Testing connection...");
  try {
    const res = await fetch(
      `https://api.telegram.org/bot${botToken}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text: "✅ *OpenHiru is connected!*\nSend me a command and I will assist you.",
          parse_mode: "Markdown",
        }),
      }
    );
    if (!res.ok) throw new Error(await res.text());
    s.stop("Success ✓");
  } catch (e: any) {
    s.stop(c.red("Failed: " + e.message));
    process.exit(1);
  }

  const updated = {
    ...config,
    telegramBotToken: String(botToken),
    telegramAllowedChatId: String(chatId),
  };

  const { saveConfig } = await import("../utils/config.js");
  await saveConfig(updated);

  outro(c.green("✨ Setup complete!") + ` ${chalk.white("You can now run: ")}` + c.light("openhiru"));
  return updated;
}
