import chalk from "chalk";

export const THEME = {
  primary:   "#FFFFFF",   // Pure White — main brand color
  light:     "#F0F0F0",   // Light Grey — highlights
  dark:      "#333333",   // Dark Grey — borders
  muted:     "#888888",   // Medium Grey — secondary text
  glow:      "#BBBBBB",   // Silver — glow/active states
  purple:    "#A78BFA",   // Soft violet — from image headers
  peach:     "#FB923C",   // Peach/Orange — from image selection
  bg:        "#000000",   // True Black — backgrounds
  modalBg:   "#1A1A1A",   // Dark grey — for popup background
} as const;

export const ORANGE = THEME; // Keep alias for compatibility if needed elsewhere

// Chalk shortcuts
export const c = {
  primary:  (s: string) => chalk.hex(THEME.primary)(s),
  light:    (s: string) => chalk.hex(THEME.light)(s),
  dark:     (s: string) => chalk.hex(THEME.dark)(s),
  muted:    (s: string) => chalk.hex(THEME.muted)(s),
  glow:     (s: string) => chalk.hex(THEME.glow)(s),
  bold:     (s: string) => chalk.hex(THEME.primary).bold(s),
  dim:      (s: string) => chalk.dim(s),
  white:    (s: string) => chalk.white(s),
  green:    (s: string) => chalk.greenBright(s),
  red:      (s: string) => chalk.redBright(s),
  label:    (s: string) => chalk.bgHex(THEME.primary).black.bold(` ${s} `),
  bar:      (n: number, total: number, w = 20) => {
    const filled = Math.round((n / total) * w);
    return chalk.hex(THEME.primary)("█".repeat(filled)) + chalk.dim("░".repeat(w - filled));
  },
};
