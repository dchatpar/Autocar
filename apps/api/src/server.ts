/**
 * Server bootstrap — starts the Fastify app and listens on port 3001.
 *
 * Usage:
 *   pnpm dev          # tsx watch mode
 *   pnpm start        # production (after build)
 */

import "dotenv/config";
import { buildApp } from "./app.js";
import { logger } from "./utils/logger.js";

async function main(): Promise<void> {
  const app = await buildApp();

  const port = Number(process.env.API_PORT ?? 3001);
  const host = process.env.API_HOST ?? "0.0.0.0";

  try {
    await app.listen({ port, host });
    app.log.info(`DealerOS API ready at http://${host}:${port}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }

  // Graceful shutdown
  const shutdown = async (signal: string): Promise<void> => {
    app.log.info(`Received ${signal}, shutting down gracefully...`);
    try {
      await app.close();
      process.exit(0);
    } catch (err) {
      app.log.error(err);
      process.exit(1);
    }
  };

  process.on("SIGINT", () => {
    void shutdown("SIGINT");
  });
  process.on("SIGTERM", () => {
    void shutdown("SIGTERM");
  });
}

main().catch((err: unknown) => {
  logger.error("server", "Fatal error starting API:", err);
  process.exit(1);
});
