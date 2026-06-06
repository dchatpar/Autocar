/**
 * Boot smoke test — builds the full Fastify app and prints the
 * route table to confirm /notifications and the websocket plugin
 * are wired in. Run with:
 *   cd apps/api && tsx scripts/realtime-build-smoke.ts
 */
import { buildApp } from "../src/app.js";

async function main(): Promise<void> {
  const app = await buildApp();
  // Print the full route table to stdout for inspection.
  console.log(app.printRoutes({ commonPrefix: false }));
  await app.close();
  process.exit(0);
}

main().catch((err) => {
  console.error("Build smoke failed:", err);
  process.exit(1);
});
