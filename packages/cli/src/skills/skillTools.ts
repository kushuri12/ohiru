// src/skills/skillTools.ts
// Tools that let the AI manage skills dynamically

import { z } from "zod";
import { SkillManager } from "./SkillManager.js";

/**
 * Creates the skill management tool that the AI uses to create/test/fix skills.
 * Returns a set of tools to be merged into internalTools.
 */
export function createSkillTools(skillManager: SkillManager) {
  return {
    manage_skills: {
      description: `Manage Hiru's learnable skills. Actions: list, create, test, fix, delete.

CREATING SKILLS — QUALITY RULES:
1. ALWAYS provide "parameters" as JSON with type, description, required for EVERY arg
2. For geo/location skills: add "country" param with default "Indonesia" in code  
3. Use JSON APIs (e.g. ?format=j1) NOT plain text APIs — more reliable data
4. Handle errors: check response.ok, validate parsed data, throw clear errors
5. Return RICH formatted output with all relevant data
6. Always add relevant "tags" (comma-separated)
7. TEST with REALISTIC args (real city names, real values) not empty objects

Code format: ES module with default export async function that returns a string.
Available: fetch(), Node.js built-ins (fs, path, os, child_process).

WORKFLOW: create → test (with real args) → fix if error → test again → use it`,
      parameters: z.object({
        action: z.enum(["list", "create", "test", "fix", "delete"]).describe("What to do"),
        name: z.string().optional().describe("Skill name (for create/test/fix/delete)"),
        description: z.string().optional().describe("Skill description (for create)"),
        parameters: z.string().optional().describe('REQUIRED for create. JSON: {"city":{"type":"string","description":"Nama kota","required":true}}'),
        code: z.string().optional().describe("ES module code with default export async function (for create/fix)"),
        test_args: z.string().optional().describe("JSON test args with REAL values, e.g. {\"city\":\"Jakarta\"} not {}"),
        tags: z.string().optional().describe("Comma-separated tags (for create), e.g. 'weather,geo,indonesia'"),
        full_description: z.string().optional().describe("Detailed markdown documentation for the skill (optional)"),
      }),
      execute: async (args: any) => {
        const { action, name, description, parameters, code, test_args, tags, full_description } = args;

        switch (action) {
          case "list": {
            const skills = skillManager.listSkills();
            if (skills.length === 0) {
              return "No skills installed yet. You can create one with action: 'create'.";
            }
            const list = skills.map(s => {
              const status = s.testResult
                ? (s.testResult.success ? "✅ tested" : "❌ failing")
                : "⚠️ untested";
              return `• ${s.name} — ${s.description} [${status}] (v${s.version})`;
            }).join("\n");
            return `Installed skills (${skills.length}):\n${list}`;
          }

          case "create": {
            if (!name || !description || !code) {
              return "Error: 'create' requires name, description, and code.";
            }

            // Enforce parameter definition
            if (!parameters || parameters === "{}" || parameters === "{}") {
              return "Error: 'parameters' is REQUIRED and cannot be empty. Define all function arguments as JSON: {\"argName\":{\"type\":\"string\",\"description\":\"...\",\"required\":true}}";
            }

            let parsedParams: Record<string, any> = {};
            if (parameters) {
              try {
                parsedParams = JSON.parse(parameters);
              } catch {
                return "Error: 'parameters' must be valid JSON.";
              }
            }

            if (Object.keys(parsedParams).length === 0) {
              return "Error: parameters cannot be empty. Every skill argument must be declared.";
            }

            const parsedTags = tags ? tags.split(",").map((t: string) => t.trim()) : [];
            const result = await skillManager.createSkill(name, description, parsedParams, code, parsedTags, full_description);

            if (result.success) {
              return `✅ Skill "${name}" created!\n\nNow you MUST test it: use action "test", name "${name}", test_args with REAL values (e.g. {"city":"Jakarta"} not {}).\nDo NOT skip testing.`;
            } else {
              return `❌ Failed to create skill "${name}": ${result.error}`;
            }
          }

          case "test": {
            if (!name) return "Error: 'test' requires a skill name.";

            let parsedTestArgs: any = {};
            if (test_args) {
              try {
                parsedTestArgs = JSON.parse(test_args);
              } catch {
                return "Error: 'test_args' must be valid JSON.";
              }
            }

            const result = await skillManager.testSkill(name, parsedTestArgs);
            if (result.success) {
              return `✅ Skill "${name}" test PASSED!\nOutput: ${result.output}`;
            } else {
              return `❌ Skill "${name}" test FAILED!\nError: ${result.output}\n\nFix it with action: "fix", name: "${name}", code: "<fixed code>"`;
            }
          }

          case "fix": {
            if (!name || !code) return "Error: 'fix' requires name and new code.";
            const result = await skillManager.updateSkillCode(name, code);
            if (result.success) {
              return `✅ Skill "${name}" code updated! Now TEST it again.`;
            } else {
              return `❌ Failed to update "${name}": ${result.error}`;
            }
          }

          case "delete": {
            if (!name) return "Error: 'delete' requires a skill name.";
            await skillManager.deleteSkill(name);
            return `🗑️ Skill "${name}" deleted.`;
          }

          default:
            return `Unknown action: ${action}. Use: list, create, test, fix, delete.`;
        }
      },
    },
  };
}
