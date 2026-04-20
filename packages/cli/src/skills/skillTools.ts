// src/skills/skillTools.ts
// Tools that let the AI manage skills dynamically — supports multi-file, multi-language skills

import { z } from "zod";
import { SkillManager, SkillFile } from "./SkillManager.js";

/**
 * Creates the skill management tool that the AI uses to create/test/fix skills.
 * Returns a set of tools to be merged into internalTools.
 */
export function createSkillTools(skillManager: SkillManager, libraryManager?: SkillManager) {
  return {
    manage_skills: {
      description: `Manage Hiru's learnable skills. Actions: list, create, test, fix, delete, add_file, list_files.

CREATING SKILLS — QUALITY RULES:
1. ALWAYS provide "parameters" as JSON with type, description, required for EVERY arg
2. For geo/location skills: add "country" param with default "Indonesia" in code  
3. Use JSON APIs (e.g. ?format=j1) NOT plain text APIs — more reliable data
4. Handle errors: check response.ok, validate parsed data, throw clear errors
5. Return RICH formatted output with all relevant data
6. Always add relevant "tags" (comma-separated)
7. TEST with REALISTIC args (real city names, real values) not empty objects
8. Library skills are read-only; you can only create/edit/delete skills in your own skill directory.

MULTI-FILE SKILL SUPPORT:
- Skills live in a folder (e.g. ~/.openhiru/skills/buat_document/)
- You can use ANY language: Python (.py), JavaScript (.js/.mjs), TypeScript (.ts), Shell (.sh), Batch (.bat), etc.
- Set "main_filename" to your entry file, e.g. "main.py" or "generator.js"
- Add extra support files via "extra_files" JSON array: [{"filename":"config.json","content":"..."},{"filename":"helpers.py","content":"..."}]
- For Python: read args via json.loads(sys.stdin.read()) or os.environ["SKILL_ARGS"]
- For Shell: read args via $SKILL_ARGS env variable
- Each language has its own runtime: python for .py, node for .js, bash for .sh, etc.

Code format for JS: ES module with default export async function that returns a string.
Code format for Python: script that reads JSON from stdin, prints result to stdout.
Code format for Shell: script that reads $SKILL_ARGS, outputs to stdout.
Available in JS: fetch(), Node.js built-ins (fs, path, os, child_process).

WORKFLOW: create → test (with real args) → fix if error → test again → use it`,
      parameters: z.object({
        action: z.enum(["list", "create", "read", "test", "fix", "delete", "add_file", "list_files"]).describe("What to do. Use 'read' to view existing skill code before fixing."),
        name: z.string().optional().describe("Skill name (for create/test/fix/delete/add_file/list_files)"),
        description: z.string().optional().describe("Skill description (for create)"),
        parameters: z.string().optional().describe('REQUIRED for create. JSON: {"city":{"type":"string","description":"Nama kota","required":true}}'),
        code: z.string().optional().describe("Main entry-point code (for create/fix). Can be Python, JS, Shell, etc."),
        main_filename: z.string().optional().describe("Main entry filename, e.g. 'main.py', 'generator.js', 'run.sh'. Defaults to '<name>.mjs'"),
        extra_files: z.string().optional().describe('JSON array of extra files: [{"filename":"config.json","content":"{...}"},{"filename":"helpers.py","content":"import..."}]'),
        test_args: z.string().optional().describe("JSON test args with REAL values, e.g. {\"city\":\"Jakarta\"} not {}"),
        tags: z.string().optional().describe("Comma-separated tags (for create), e.g. 'weather,geo,indonesia'"),
        full_description: z.string().optional().describe("Detailed markdown documentation for the skill (optional)"),
        // For add_file action
        filename: z.string().optional().describe("Filename to add/update (for add_file action), e.g. 'utils.py'"),
        file_content: z.string().optional().describe("Content of the file to add/update (for add_file action)"),
      }),
      execute: async (args: any) => {
        const { action, name, description, parameters, code, main_filename, extra_files, test_args, tags, full_description, filename, file_content } = args;

        switch (action) {
          case "list": {
            const userSkills = skillManager.listSkills();
            const libSkills = libraryManager ? libraryManager.listSkills() : [];
            const total = userSkills.length + libSkills.length;

            if (total === 0) {
              return "No skills installed yet. You can create one with action: 'create'.";
            }

            const formatList = (skills: any[], label: string) => {
              if (skills.length === 0) return "";
              const list = skills.map(s => {
                const status = s.testResult
                  ? (s.testResult.success ? "✅ tested" : "❌ failing")
                  : "⚠️ untested";
                const lang = s.main ? ` [${s.main}]` : " [.mjs]";
                const fileCount = s.files ? ` (${s.files.length} files)` : "";
                return `  • ${s.name}${lang}${fileCount} — ${s.description} [${status}] (v${s.version})`;
              }).join("\n");
              return `\n${label}:\n${list}`;
            };

            return `Installed skills (${total}):` + 
                   formatList(userSkills, "User Skills") + 
                   formatList(libSkills, "Built-in Library");
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

            // Parse extra files
            let parsedExtraFiles: SkillFile[] | undefined;
            if (extra_files) {
              try {
                parsedExtraFiles = JSON.parse(extra_files) as SkillFile[];
                if (!Array.isArray(parsedExtraFiles)) {
                  return "Error: 'extra_files' must be a JSON array of {filename, content} objects.";
                }
                for (const ef of parsedExtraFiles) {
                  if (!ef.filename || typeof ef.content !== "string") {
                    return `Error: each extra_file must have "filename" and "content". Got: ${JSON.stringify(ef)}`;
                  }
                }
              } catch {
                return "Error: 'extra_files' must be valid JSON array.";
              }
            }

            const parsedTags = tags ? tags.split(",").map((t: string) => t.trim()) : [];
            const result = await skillManager.createSkill(
              name,
              description,
              parsedParams,
              code,
              parsedTags,
              full_description,
              parsedExtraFiles,
              main_filename,
            );

            if (result.success) {
              const mainInfo = main_filename ? ` (main: ${main_filename})` : "";
              const filesInfo = parsedExtraFiles ? ` with ${parsedExtraFiles.length + 1} files` : "";
              return `✅ Skill "${name}" created${mainInfo}${filesInfo}!\n\nNow you MUST test it: use action "test", name "${name}", test_args with REAL values (e.g. {"city":"Jakarta"} not {}).\nDo NOT skip testing.`;
            } else {
              return `❌ Failed to create skill "${name}": ${result.error}`;
            }
          }

          case "read": {
            if (!name) return "Error: 'read' requires a skill name.";
            let readResult = await skillManager.readSkillFiles(name);
            if ("error" in readResult && libraryManager) {
              readResult = await libraryManager.readSkillFiles(name);
            }
            if ("error" in readResult) return `❌ ${readResult.error}`;
            return readResult.content;
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

            let result = await skillManager.testSkill(name, parsedTestArgs);
            if (!result.success && libraryManager) {
               // Try library if it failed in user manager (or wasn't found)
               const libResult = await libraryManager.testSkill(name, parsedTestArgs);
               if (libResult.success || !libResult.output.includes("not found")) {
                 result = libResult;
               }
            }

            if (result.success) {
              return `✅ Skill "${name}" test PASSED!\nOutput: ${result.output}`;
            } else {
              return `❌ Skill "${name}" test FAILED!\nError: ${result.output}`;
            }
          }

          case "fix": {
            if (!name || !code) return "Error: 'fix' requires name and new code.";
            if (libraryManager && (await libraryManager.listSkillFiles(name) as any).files) {
              return `❌ Skill "${name}" belongs to the built-in library and is READ-ONLY. To customize it, create a new skill with a different name.`;
            }
            const fixResult = await skillManager.updateSkillCode(name, code);
            if (!fixResult.success) return `❌ Failed to update "${name}": ${fixResult.error}`;
            // Auto-test after fix
            let parsedTestArgs: any = {};
            try { if (args.test_args) parsedTestArgs = JSON.parse(args.test_args); } catch {}
            const autoTest = await skillManager.testSkill(name, parsedTestArgs);
            if (autoTest.success) {
              return `✅ Skill "${name}" fixed and auto-tested successfully!\nOutput: ${autoTest.output}`;
            }
            return `⚠️ Skill "${name}" code updated BUT test still FAILED:\n${autoTest.output}\n\nFix the remaining errors.`;
          }

          case "add_file": {
            if (!name) return "Error: 'add_file' requires a skill name.";
            if (!filename || !file_content) return "Error: 'add_file' requires 'filename' and 'file_content'.";

            const result = await skillManager.updateSkillFile(name, filename, file_content);
            if (result.success) {
              return `✅ File "${filename}" added/updated in skill "${name}".`;
            } else {
              return `❌ Failed to add file: ${result.error}`;
            }
          }

          case "list_files": {
            if (!name) return "Error: 'list_files' requires a skill name.";

            const result = await skillManager.listSkillFiles(name);
            if ("error" in result) {
              return `❌ ${result.error}`;
            }

            const list = result.files.map(f => {
              const sizeKB = (f.size / 1024).toFixed(1);
              return `  📄 ${f.name} (${f.language}, ${sizeKB}KB)`;
            }).join("\n");
            return `Files in skill "${name}":\n${list}`;
          }

          case "delete": {
            if (!name) return "Error: 'delete' requires a skill name.";
            if (libraryManager && (await libraryManager.listSkillFiles(name) as any).files) {
              return `❌ Skill "${name}" belongs to the built-in library and cannot be deleted.`;
            }
            await skillManager.deleteSkill(name);
            return `🗑️ Skill "${name}" deleted.`;
          }

          default:
            return `Unknown action: ${action}. Use: list, create, test, fix, delete, add_file, list_files.`;
        }
      },
    },
  };
}
