import chalk from "chalk";

export const ORANGE = {
  primary:   "#FF6B00",   // vivid orange — main brand color
  light:     "#FF9A3C",   // soft orange — highlights, accents
  dark:      "#CC4E00",   // deep orange — borders, shadows
  muted:     "#CC785C",   // terracotta — secondary text
  glow:      "#FFB347",   // warm amber — glow/active states
  bg:        "#1A0A00",   // near-black orange tint — backgrounds (if needed)
} as const;

// Chalk shortcuts
export const c = {
  primary:  (s: string) => chalk.hex(ORANGE.primary)(s),
  light:    (s: string) => chalk.hex(ORANGE.light)(s),
  dark:     (s: string) => chalk.hex(ORANGE.dark)(s),
  muted:    (s: string) => chalk.hex(ORANGE.muted)(s),
  glow:     (s: string) => chalk.hex(ORANGE.glow)(s),
  bold:     (s: string) => chalk.hex(ORANGE.primary).bold(s),
  dim:      (s: string) => chalk.dim(s),
  white:    (s: string) => chalk.white(s),
  green:    (s: string) => chalk.greenBright(s),
  red:      (s: string) => chalk.redBright(s),
  label:    (s: string) => chalk.bgHex(ORANGE.primary).black.bold(` ${s} `),
  bar:      (n: number, total: number, w = 20) => {
    const filled = Math.round((n / total) * w);
    return chalk.hex(ORANGE.primary)("█".repeat(filled)) + chalk.dim("░".repeat(w - filled));
  },
};
