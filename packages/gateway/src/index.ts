import { GatewayServer } from "./GatewayServer.js";
import { GatewayDoctor } from "./doctor/GatewayDoctor.js";
import chalk from "chalk";

export * from "./GatewayServer.js";
export * from "./router/MessageRouter.js";
export * from "./router/RoutingRule.js";
export * from "./session/SessionRegistry.js";
export * from "./session/SessionState.js";
export * from "./metrics/GatewayMetrics.js";

async function main() {
  const port = Number(process.env.HIRU_GATEWAY_PORT) || 18790;
  const server = new GatewayServer({ port });

  process.on("SIGINT", async () => {
    console.log(chalk.yellow("\nShutting down Gateway..."));
    await server.stop();
    process.exit(0);
  });

  process.on("SIGTERM", async () => {
    console.log(chalk.yellow("\nShutting down Gateway..."));
    await server.stop();
    process.exit(0);
  });

  try {
    await server.start();
    const doctor = new GatewayDoctor();
    const status = await doctor.getHealthStatus();
    console.log(chalk.cyan(`Gateway Status: ${status.status}`));
  } catch (error) {
    console.error(chalk.red("Failed to start Gateway:"), error);
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}` || process.env.HIRU_GATEWAY_AUTOSTART === "true") {
  main();
}
