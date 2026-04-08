// src/telegram/TelegramFormatter.ts

export const TOOL_EMOJI: Record<string, string> = {
  write_file:      "✏️",
  create_file:     "📄",
  read_file:       "📖",
  edit_file:       "📝",
  list_files:      "📂",
  search_files:    "🔍",
  run_shell:       "⚡",
  delete_file:     "🗑",
  open_app:        "🚀",
  type_text:       "⌨️",
  press_key:       "🔘",
  take_screenshot: "📸",
  move_mouse:      "🖱️",
};

export class TelegramFormatter {
  formatResponse(text: string): string {
    let formatted = text
      .replace(/<(?:thinking|think|thought|thought_process|reasoning)>[\s\S]*?<\/(?:thinking|think|thought|thought_process|reasoning)>/gi, "")
      .replace(/<plan>[\s\S]*?<\/plan>/gi, "")
      .replace(/<tool_call>[\s\S]*?<\/tool_call>/gi, "")
      .replace(/\*\*(.+?)\*\*/g, "*$1*")
      .trim();

    // Strip common preambles common in Indonesian/English models
    const preambles = [
      /^(baik|siap|tentu|oke|paham|sip|oke sip)[,\s\.]*/i,
      /^(i will|starting|execution starting|i am starting|i'll|i am starting the execution)[,\s\.]*/i,
      /^(proceeding with|as approved|executing step|proceed with the execution)[,\s\.]*/i,
      /^(i am starting the execution of the approved plan now|hasil analisis saya|kesimpulannya|kesimpulan)[,\s\.:]*/i,
      /^execution result already completed above[:\s]*/i,
      /^(berikut adalah|berikut ini|ini adalah) (hasil|daftar|list)[:\s]*/i,
      /^\d+ (anime|item|data|judul) (titles? )?(retrieved|ditemukan|berhasil)[^.\n]*[.\n]*/i,
      /^(skill_\w+ telah|saya sudah menjalankan skill_\w+)[^.\n]*[.\n]*/i,
    ];
    for (const p of preambles) {
      formatted = formatted.replace(p, "").trim();
    }
    return formatted;
  }

  toolCallLine(
    toolName: string,
    args: Record<string, any>,
    status: "running" | "done" | "error"
  ): string {
    const emoji = TOOL_EMOJI[toolName] ?? "⚙️";
    const icon  = status === "running" ? "⏳" : status === "done" ? "✅" : "❌";
    const arg   = this.getMainArg(toolName, args);
    const argStr = arg ? ` \`${arg.slice(0, 60)}\`` : "";
    return `${icon} ${emoji} ${toolName}${argStr}`;
  }

  formatPlan(plan: any): string {
    const lines = [`📋 *${plan.goal}*`, ""];
    for (const step of plan.steps ?? []) {
      lines.push(`${step.number}. ${step.verb} \`${step.target}\``);
      if (step.reason) lines.push(`   _${step.reason}_`);
    }
    if (plan.filesAffected?.filter((f: any) => f.operation !== "read-only").length > 0) {
      lines.push("", "*Files:*");
      for (const f of plan.filesAffected) {
        if (f.operation !== "read-only") {
          const icon = f.operation === "create" ? "+" : f.operation === "delete" ? "-" : "~";
          lines.push(`${icon} \`${f.path}\``);
        }
      }
    }
    return lines.join("\n");
  }

  private getMainArg(toolName: string, args: Record<string, any>): string {
    if (!args || typeof args !== "object") return "";
    const keys: Record<string, string[]> = {
      write_file: ["path"], create_file: ["path"], read_file: ["path"],
      edit_file: ["path"], open_app: ["app"], type_text: ["text"],
      press_key: ["key"], run_shell: ["command"],
    };
    const priority = keys[toolName] ?? Object.keys(args);
    for (const k of priority) if (args[k]) return String(args[k]);
    return Object.values(args).find(v => typeof v === "string") || "";
  }
}
