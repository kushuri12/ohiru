// packages/cli/src/thinking/symbols.ts

const isUnicodeTerminal = (() => {
  if (process.env.HIRU_ASCII_MODE === "1") return false;
  if (process.platform === "win32") {
    return Boolean(
      process.env.WT_SESSION       ||   // Windows Terminal
      process.env.TERM_PROGRAM === "vscode" ||
      process.env.ConEmuPID        ||   // ConEmu/Cmder
      process.env.MSYSTEM               // Git Bash
    );
  }
  return true; // macOS/Linux selalu support
})();

const s = (unicode: string, ascii: string) =>
  isUnicodeTerminal ? unicode : ascii;

export const S = {
  // Status icons
  thinking:    s("◈", "*"),
  done:        s("✓", "+"),
  error:       s("✗", "x"),
  running:     s("◐", "~"),
  pending:     s("○", "."),
  skipped:     s("⊘", "-"),
  warning:     s("⚠", "!"),
  plan:        s("◆", "#"),
  check:       s("✔", "[ok]"),

  // Navigation
  upDown:      s("↑↓", "^v"),
  up:          s("↑",  "^"),
  down:        s("↓",  "v"),
  right:       s("→",  "->"),
  bullet:      s("●",  "*"),

  // Decorative
  dash:        s("─",  "-"),
  vbar:        s("│",  "|"),
  corner:      s("└",  "+"),

  // Section icons
  explore:    s("🔍", "[?]"),
  analyze:    s("🧠", "[~]"),
  evaluate:   s("⚖️", "[=]"),
  decide:     s("✔️", "[v]"),
  planIcon:   s("📋", "[P]"),
  risk:       s("⚠️", "[!]"),
} as const;

export const SYMBOLS = S;
