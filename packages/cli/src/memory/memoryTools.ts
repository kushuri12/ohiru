import { z } from "zod";
import { GlobalMemory, GlobalMemoryData } from "./GlobalMemory.js";

export function createMemoryTools(memory: GlobalMemory) {
    return {
        manage_memory: {
            description: `Manage Hiru's Long-Term Memory to remember important facts cross-session.
You can:
- "add_fact": Remember something important about the user (e.g. "User lives in Bali", "User likes dark mode")
- "remove_fact": Forget a specific fact by index
- "set_pref": Save a string-based preference key/value (e.g. key="editor", value="vscode")
- "remove_pref": Delete a preference key
- "list": View current memory (Though memory is also injected automatically in your System Prompt)

You MUST use this anytime the user shares personal details, preferences, or important global rules they want you to remember across all projects forever.`,
            parameters: z.object({
                action: z.enum(["add_fact", "remove_fact", "set_pref", "remove_pref", "list", "set_identity", "get_all", "show"]),
                fact: z.string().optional().describe("Fact text to store (for add_fact)"),
                index: z.number().optional().describe("Index of fact to remove (for remove_fact)"),
                key: z.string().optional().describe("Preference key (for set/remove_pref)"),
                value: z.string().optional().describe("Preference value (for set_pref / set_identity)")
            }),
            execute: async (args: { action: string, fact?: string, index?: number, key?: string, value?: string }) => {
                switch(args.action) {
                    case "set_identity":
                        if (!args.value) return "Error: 'value' (identity text) required";
                        await memory.setIdentity(args.value);
                        return `✨ Identity updated. Hiru now knows who they are.`;
                    case "add_fact":
                        if (!args.fact) return "Error: 'fact' text required";
                        await memory.addFact(args.fact);
                        return `✅ Fact saved: "${args.fact}"`;
                    case "remove_fact":
                        if (typeof args.index !== "number") return "Error: 'index' required";
                        await memory.removeFact(args.index);
                        return `✅ Fact at index ${args.index} removed.`;
                    case "set_pref":
                        if (!args.key || !args.value) return "Error: 'key' and 'value' required";
                        await memory.setPreference(args.key, args.value);
                        return `✅ Preference saved: ${args.key}=${args.value}`;
                    case "remove_pref":
                        if (!args.key) return "Error: 'key' required";
                        await memory.deletePreference(args.key);
                        return `✅ Preference removed: ${args.key}`;
                    case "list":
                    case "get_all":
                    case "show":
                        return JSON.stringify(memory.getData(), null, 2);
                    default:
                        return `Error: Unknown action "${args.action}". You MUST use one of: add_fact, remove_fact, set_pref, remove_pref, list, set_identity.`;
                }
            }
        }
    }
}
