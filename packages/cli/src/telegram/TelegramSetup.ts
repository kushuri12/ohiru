// src/telegram/TelegramSetup.ts
import chalk from "chalk";

export async function runTelegramSetup(config: any): Promise<any> {
  const { text, password, isCancel, cancel, intro, outro, spinner } =
    await import("@clack/prompts");

  console.log();
  intro(chalk.bgCyan(chalk.black(" Setup Telegram Bot ")));

  console.log(chalk.gray(`
  Cara setup:
  1. Buka Telegram → cari @BotFather
  2. Kirim /newbot → ikuti petunjuk → copy token
  3. Kirim pesan ke bot kamu (apapun)
  4. Buka: https://api.telegram.org/bot<TOKEN>/getUpdates
  5. Catat angka dari "chat":{"id": ANGKA_INI}
  `));

  const botToken = await password({
    message: "Bot Token dari @BotFather:",
    validate: (v: string) => (!v || !v.includes(":")) ? "Format token tidak valid" : undefined,
  });
  if (isCancel(botToken)) { cancel("Setup dibatalkan."); process.exit(0); }

  const chatId = await text({
    message: "Chat ID kamu (angka dari getUpdates):",
    placeholder: "1234567890",
    validate: (v: string) => (!v || isNaN(Number(v))) ? "Harus berupa angka" : undefined,
  });
  if (isCancel(chatId)) { cancel("Setup dibatalkan."); process.exit(0); }

  // Test koneksi
  const s = spinner();
  s.start("Test koneksi...");
  try {
    const res = await fetch(
      `https://api.telegram.org/bot${botToken}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text: "✅ *Hiru terhubung!*\nKirim perintah apa saja.",
          parse_mode: "Markdown",
        }),
      }
    );
    if (!res.ok) throw new Error(await res.text());
    s.stop("Berhasil ✓");
  } catch (e: any) {
    s.stop(chalk.red("Gagal: " + e.message));
    process.exit(1);
  }

  const updated = {
    ...config,
    telegramBotToken: String(botToken),
    telegramAllowedChatId: String(chatId),
  };

  const { saveConfig } = await import("../utils/config.js");
  await saveConfig(updated);

  outro(chalk.green("Setup selesai! Jalankan: ") + chalk.cyan("hiru tele"));
  return updated;
}
