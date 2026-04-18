import { AgentOrchestrator } from "../AgentOrchestrator.js";
import { WorkspaceManager } from "../WorkspaceManager.js";
import chalk from "chalk";

export async function handleAgentsCommand(args: string[]) {
  const orchestrator = new AgentOrchestrator();
  const workspaceManager = new WorkspaceManager(orchestrator["agentsDir"]); // Accessing private for CLI simplicity

  const cmd = args[0];

  switch (cmd) {
    case "list":
      const agents = orchestrator.listAgents();
      console.log(chalk.bold.hex("#CC785C")(`\n --- ACTIVE AGENTS --- `));
      if (agents.length === 0) console.log(chalk.gray(" No active agents."));
      agents.forEach(id => console.log(` - ${id}`));
      console.log("");
      break;

    case "add":
      const id = args[1];
      const name = args[2] || id;
      if (!id) {
        console.error(chalk.red("Usage: hiru agents add <id> [name]"));
        return;
      }
      await workspaceManager.createWorkspace(id, name);
      break;

    case "remove":
      const deleteId = args[1];
      if (!deleteId) {
        console.error(chalk.red("Usage: hiru agents remove <id>"));
        return;
      }
      await workspaceManager.deleteWorkspace(deleteId);
      break;

    default:
      console.log(`
Usage: hiru agents <command>

Commands:
  list                List all active agents
  add <id> [name]     Create a new agent workspace
  remove <id>         Delete an agent workspace
      `);
  }
}
