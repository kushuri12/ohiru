// packages/cli/src/utils/platform.ts

export const IS_WINDOWS = process.platform === "win32";

export function detectTerminalSupport(): {
  unicode: boolean;
  color: boolean;
  trueColor: boolean;
} {
  if (IS_WINDOWS) {
    // Windows Terminal (WT_SESSION env var diset oleh Windows Terminal)
    const isWindowsTerminal = Boolean(process.env.WT_SESSION);
    // VS Code integrated terminal
    const isVSCode = process.env.TERM_PROGRAM === "vscode";
    // ConEmu / Cmder
    const isConEmu = Boolean(process.env.ConEmuPID);
    // Git Bash / MSYS2
    const isMSYS = Boolean(process.env.MSYSTEM);

    const hasGoodTerminal = isWindowsTerminal || isVSCode || isConEmu || isMSYS;

    return {
      unicode:   hasGoodTerminal,
      color:     hasGoodTerminal || Boolean(process.env.FORCE_COLOR),
      trueColor: isWindowsTerminal || isVSCode,
    };
  }

  // macOS / Linux \u2014 hampir selalu support
  return {
    unicode:   true,
    color:     !process.env.NO_COLOR,
    trueColor: process.env.COLORTERM === "truecolor" ||
               process.env.COLORTERM === "24bit",
  };
}

// Setup di entry point sebelum apapun di-render
export async function setupWindowsTerminal(): Promise<void> {
  if (!IS_WINDOWS) return;

  // Enable ANSI escape codes di Windows Console
  // (diperlukan untuk chalk di PowerShell lama)
  try {
    const { execSync } = await import("child_process");
    execSync("chcp 65001", { stdio: "ignore" }); // Set UTF-8 code page
  } catch {
    // Ignore \u2014 mungkin tidak tersedia
  }
}
