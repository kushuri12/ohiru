// src/ui/theme.ts — Blue theme (matches @clack/prompts setup wizard)

export const theme = {
  // Brand / Accent — Anthropic Rust #D97757
  accent:          "#D97757",         
  accentBright:    "#EC8F73",         
  accentDim:       "#B05D42",         

  // Text hierarchy (Claude uses clean white/grey)
  textPrimary:     "white",           
  textSecondary:   "#abb2bf",
  textMuted:       "blackBright",

  // Semantic
  success:         "#50fa7b",
  successBright:   "greenBright",
  warning:         "#f1fa8c",
  warningBright:   "yellowBright",
  error:           "#ff5555",
  errorBright:     "redBright",
  info:            "#8be9fd",
  infoBright:      "cyanBright",

  // UI Elements
  toolName:        "#6272a4",         // Muted purplish for tools
  toolBorder:      "#44475a",
  separator:       "#44475a",
  background:      "#282a36",
} as const;
