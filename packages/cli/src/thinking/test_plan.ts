import { PlanParser } from "./PlanParser.js";

const parser = new PlanParser();

const planContent = `
GOAL: Fix a bug in player.ts
STEPS:
1. Read src/player.ts \u2014 inspect code
2. Edit src/player.ts \u2014 fixed null pointer
3. Run  npm test     \u2014 verify
FILES AFFECTED:
- src/player.ts \u2192 modify
ASSUMPTIONS:
- User is on node 18
RISKS:
- May break existing tests
`;

const parsed = parser.parse(planContent);
console.log(JSON.stringify(parsed, null, 2));
