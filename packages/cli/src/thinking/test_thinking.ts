import { ThinkingEngine } from "./ThinkingEngine.js";

const engine = new ThinkingEngine();

const tokens = [
  "<thinking>",
  "[EXPLORE] Reading the codebase to find the issue.\n",
  "[ANALYZE] Found a null pointer at line 42.\n",
  "[EVALUATE] Chose option 1 over 2.\n",
  "</thinking>",
  "<plan>",
  "GOAL: Fix the issue.\n",
  "STEPS:\n",
  "1. Read src/file.ts \u2014 inspect code\n",
  "2. Edit src/file.ts \u2014 apply fix\n",
  "FILES AFFECTED:\n",
  "- src/file.ts \u2192 modify\n",
  "</plan>"
];

for (const token of tokens) {
  const block = engine.feedToken(token);
  if (block) {
    console.log("Completed Block:", block.section, block.content);
  }
}

console.log("Final State:", JSON.stringify(engine.getState(), null, 2));
