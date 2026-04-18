import chalk from "chalk";
import { c } from "./theme.js";

// Large Mascot (~7 lines)
export const MASCOT_LG = [
  `      ${c.primary("▲")}   ${c.primary("▲")}`,
  `     ${c.primary("╭")}${c.light("───")}${c.primary("╮")}`,
  `    ${c.primary("( ")}${chalk.white("◡")} ${chalk.white("ω")} ${chalk.white("◡")}${c.primary(" )")}`,
  `     ${c.primary("╰")}${c.light("─────")}${c.primary("╯")}`,
  `    ${chalk.dim("╭──┴───┴──╮")}`,
  `    ${chalk.dim("│    ")}${c.glow("⚡")}${chalk.dim("    │")}`,
  `    ${chalk.dim("╰─────────╯")}`
].join("\n");

// Medium Mascot (~4 lines)
export const MASCOT_MD = [
  `    ${c.primary("/\\")}${c.light("_")}${c.primary("/\\")}`,
  `   ${c.primary("( ")}${chalk.white("◡")}${chalk.white("ω")}${chalk.white("◡")}${c.primary(" )")}`,
  `    ${c.primary("╰")}${c.light("───")}${c.primary("╯")}`,
].join("\n");

// Small Mascot (inline)
export const MASCOT_SM = `${c.primary("(")}${chalk.white("◡")}${c.primary("ω")}${chalk.white("◡")}${c.primary(")")}`;

// Extra Small Mascot (spinner prefix)
export const MASCOT_XS = `${c.primary("◖")}${chalk.white("◡ω◡")}${c.primary("◗")}`;

/**
 * Mascot print helper
 */
export function printMascot(size: "LG" | "MD" | "SM" | "XS", tag?: string): void {
  const mascots = {
    LG: MASCOT_LG,
    MD: MASCOT_MD,
    SM: MASCOT_SM,
    XS: MASCOT_XS,
  };

  const m = mascots[size];
  if (tag) {
    if (size === "SM" || size === "XS") {
      console.log(`  ${m}  ${tag}`);
    } else {
      console.log(m);
      console.log(`  ${tag}`);
    }
  } else {
    console.log(m);
  }
}
