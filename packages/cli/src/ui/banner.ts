import chalk from "chalk";
import { c } from "./theme.js";

export const WORDMARK = [
  " ██╗    ██╗███████╗██╗      ██████╗ ███╗   ██╗██╗██████╗ ",
  " ██║    ██║██╔════╝██║     ██╔═══██╗████╗  ██║██║██╔══██╗",
  " ██║ █╗ ██║█████╗   ██║     ██║   ██║██╔██╗ ██║██║██║  ██║",
  " ██║███╗██║██╔══╝   ██║     ██║   ██║██║╚██╗██║██║██║  ██║",
  " ╚███╔███╔╝███████╗███████╗╚██████╔╝██║ ╚████║██║██████╔╝",
  "  ╚══╝ ╚═╝ ╚══════╝╚══════╝ ╚═════╝ ╚═╝  ╚═══╝╚═╝╚═════╝ ",
];

/**
 * The main startup banner shown when `openhiru` starts.
 * Layout: centered wordmark + info.
 */
export function printStartupBanner(opts: {
  version: string;
  provider: string;
  model: string;
  cwd: string;
}): void {
  console.clear();
  console.log("");

  const wordLines   = WORDMARK;

  const info = [
    c.label(` v${opts.version} — OVERPOWERED `),
    "",
    `${c.muted(" ● Provider ")} ${chalk.white(opts.provider.toUpperCase())}`,
    `${c.muted(" ● Model    ")} ${chalk.white(opts.model)}`,
    `${c.muted(" ● Path     ")} ${chalk.dim(opts.cwd)}`,
  ];

  const rightSide = [...wordLines, "", ...info];
  const width = 85;

  console.log(c.dark("  ╔" + "═".repeat(width) + "╗"));

  for (let i = 0; i < rightSide.length; i++) {
    const right = rightSide[i] ?? "";
    console.log(`${c.dark("  ║ ")}  ${right}`);
  }

  console.log(c.dark("  ╚" + "═".repeat(width) + "╝"));
  console.log("");
}

/**
 * Compact one-liner header for sub-commands.
 */
export function printCompactHeader(title: string, version: string): void {
  console.log("");
  console.log(`  ${c.bold("OPENHIRU")} ${chalk.dim("v" + version)} ${chalk.dim("—")} ${c.label(" " + title + " ")}`);
  console.log(c.dark("  " + "─".repeat(50)));
  console.log("");
}

/**
 * Divider line for sections
 */
export function divider(label?: string): void {
  if (label) {
    console.log(`\n${c.dark("  ─── ")}${c.light(label)}${c.dark(" ───────────────────────────────")}`);
  } else {
    console.log(c.dark("  " + "─".repeat(50)));
  }
}

/**
 * Status line with icon
 */
export function statusLine(icon: string, label: string, value: string): void {
  const lbl = c.muted(label.padEnd(16));
  console.log(`  ${icon}  ${lbl}${chalk.white(value)}`);
}
