// src/tools/desktop/pressKey.ts
import { z } from "zod";

// Map nama tombol casual → key code
const KEY_ALIASES: Record<string, string> = {
  enter: "Return", return: "Return",
  space: "Space", spasi: "Space",
  backspace: "Backspace", hapus: "Backspace",
  delete: "Delete",
  tab: "Tab",
  escape: "Escape", esc: "Escape",
  up: "Up", down: "Down", left: "Left", right: "Right",
  home: "Home", end: "End",
  "page up": "PageUp", "page down": "PageDown",
  f1: "F1", f2: "F2", f3: "F3", f4: "F4", f5: "F5",
  f6: "F6", f7: "F7", f8: "F8", f9: "F9", f10: "F10",
  f11: "F11", f12: "F12",
};

export const pressKeyTool: any = {
  description: `Press a keyboard key or shortcut.
Examples: enter, space, backspace, escape, tab, ctrl+c, ctrl+v, ctrl+s, alt+f4, f5
Use for: confirming dialogs, copying/pasting, saving files, closing windows.`,

  parameters: z.object({
    key: z.string().describe("Key name or shortcut (e.g. 'enter', 'ctrl+s', 'escape', 'ctrl+a')"),
    times: z.number().optional().default(1).describe("How many times to press"),
    pause_before_ms: z.number().optional().default(200),
  }),

  execute: async (args: any) => {
    const { key, times = 1, pause_before_ms = 200 } = args;

    let robot: any;
    try {
      robot = await import("@nut-tree-fork/nut-js");
    } catch {
      throw new Error("Desktop automation not available. npm install @nut-tree-fork/nut-js");
    }

    const { keyboard, Key } = robot;

    if (pause_before_ms > 0) {
      await new Promise(r => setTimeout(r, pause_before_ms));
    }

    const keyLower = key.toLowerCase().trim();

    // Handle key combinations (ctrl+s, alt+f4, etc.)
    if (keyLower.includes("+")) {
      const parts = keyLower.split("+");
      const modifiers = parts.slice(0, -1).map((m: string) => {
        m = m.trim();
        if (m === "ctrl" || m === "control") return Key.LeftControl;
        if (m === "alt") return Key.LeftAlt;
        if (m === "shift") return Key.LeftShift;
        if (m === "win" || m === "super" || m === "windows" || m === "cmd") return Key.LeftSuper;
        return null;
      }).filter(Boolean);

      const mainKey = parts[parts.length - 1].trim().toUpperCase();
      const keyObj = (Key as any)[mainKey];

      if (keyObj) {
        for (let i = 0; i < times; i++) {
          await keyboard.type(...modifiers, keyObj);
          if (times > 1) await new Promise(r => setTimeout(r, 100));
        }
        return `✓ Pressed: ${key} (${times}x)`;
      }
    }

    // Single key
    const mappedKey = KEY_ALIASES[keyLower];
    const keyName = mappedKey || key.charAt(0).toUpperCase() + key.slice(1);
    const keyObj = (Key as any)[keyName];

    if (!keyObj) {
      throw new Error(`Unknown key: "${key}". Try: enter, space, tab, escape, backspace, up, down, ctrl+c, ctrl+v, ctrl+s`);
    }

    for (let i = 0; i < times; i++) {
      await keyboard.pressKey(keyObj);
      await keyboard.releaseKey(keyObj);
      if (times > 1) await new Promise(r => setTimeout(r, 100));
    }

    return `✓ Pressed: ${key} (${times}x)`;
  },
};
