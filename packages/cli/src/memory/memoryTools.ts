import { z } from "zod";
import { GlobalMemory, GlobalMemoryData } from "./GlobalMemory.js";

export function createMemoryTools(memory: GlobalMemory) {
    return {
        manage_memory: {
            description: `Manage OpenHiru's Long-Term Memory to remember important facts cross-session.
You can:
- "add_fact": Remember something important about the user (e.g. "User lives in Bali", "User likes dark mode")
- "remove_fact": Forget a specific fact by index
- "set_pref": Save a string-based preference key/value (e.g. key="editor", value="vscode")
- "remove_pref": Delete a preference key
- "list": View current memory (Though memory is also injected automatically in your System Prompt)

You MUST use this anytime the user shares personal details, preferences, or important global rules they want you to remember across all projects forever.`,
            parameters: z.object({
                action: z.enum([
                    "add_fact", "remove_fact", "set_pref", "remove_pref", "list", "set_identity", "get_all", "show",
                    "tambah_fakta", "hapus_fakta", "simpan_pref", "hapus_pref", "lihat", "tambah", "simpan"
                ]),
                fact: z.string().optional().describe("Fact text to store (for add_fact)"),
                index: z.number().optional().describe("Index of fact to remove (for remove_fact)"),
                key: z.string().optional().describe("Preference key (for set/remove_pref)"),
                value: z.string().optional().describe("Preference value (for set_pref / set_identity)")
            }),
            execute: async (args: { action: string, fact?: string, index?: number, key?: string, value?: string }) => {
                const action = String(args.action || "").trim().toLowerCase();
                switch(action) {
                    case "set_identity":
                    case "setidentity":
                        if (!args.value) return "Error: 'value' (identity text) required";
                        await memory.setIdentity(args.value);
                        return `✨ Identity updated. OpenHiru now knows who they are.`;
                    case "add_fact":
                    case "addfact":
                    case "add":
                    case "tambah_fakta":
                    case "tambah":
                        if (!args.fact) return "Error: 'fact' text required";
                        await memory.addFact(args.fact);
                        return `✅ Fact saved: "${args.fact}"`;
                    case "remove_fact":
                    case "removefact":
                    case "delete_fact":
                        if (typeof args.index !== "number" && !args.index) return "Error: 'index' required";
                        await memory.removeFact(Number(args.index));
                        return `✅ Fact at index ${args.index} removed.`;
                    case "set_pref":
                    case "setpref":
                    case "pref":
                    case "simpan_pref":
                    case "simpan":
                        if (!args.key || !args.value) return "Error: 'key' and 'value' required for set_pref";
                        await memory.setPreference(args.key, args.value);
                        return `✅ Preference saved: ${args.key}=${args.value}`;
                    case "remove_pref":
                    case "removepref":
                    case "delete_pref":
                    case "hapus_pref":
                        if (!args.key) return "Error: 'key' required for remove_pref";
                        await memory.deletePreference(args.key);
                        return `✅ Preference removed: ${args.key}`;
                    case "list":
                    case "get_all":
                    case "show":
                    case "get":
                    case "lihat":
                        return JSON.stringify(memory.getData(), null, 2);
                    default:
                        // Fallback logic for when Zod enum might have been bypassed or updated
                        if (action.includes("add") || action.includes("tambah")) {
                             if (!args.fact) return "Error: 'fact' text required";
                             await memory.addFact(args.fact!);
                             return `✅ Fact saved: "${args.fact}"`;
                        }
                        if (action.includes("save") || action.includes("simpan") || action.includes("pref")) {
                             if (!args.key || !args.value) return "Error: 'key' and 'value' required";
                             await memory.setPreference(args.key!, args.value!);
                             return `✅ Preference saved: ${args.key}=${args.value}`;
                        }
                        return `Error: Unknown action "${args.action}". Available: add_fact, set_pref, list, remove_fact, etc.`;
                }
            }
        }
    }
}
