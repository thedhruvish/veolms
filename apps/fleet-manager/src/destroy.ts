/**
 * VeoLMS Fleet Manager — Infrastructure Destroy Dispatcher
 *
 * Reads FLEET_PROVIDER from environment and delegates to the
 * corresponding provider package's own destroy module.
 *
 * Usage:
 *   pnpm fleet:destroy
 */

import { red } from "@veolms/fleet-types/terminal";
import { loadModuleFunction } from "./core/dynamic-module.ts";

const provider = (
  process.env["FLEET_PROVIDER"] ??
  process.env["PROVIDER"] ??
  "aws"
)
  .toLowerCase()
  .trim();

async function dispatch(): Promise<void> {
  const packageName = `@veolms/fleet-provider-${provider}/destroy`;

  try {
    const destroyFn = await loadModuleFunction<() => Promise<void>>(
      packageName,
      [
        "runAwsInfraDestroy",
        "runLocalInfraDestroy",
        "runInfraDestroy",
        "default",
      ],
      `Provider destroy package "${packageName}" does not export a destroy function.`,
    );
    await destroyFn();
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(
      `Failed to load destroy module for provider "${provider}" (${packageName}). Details: ${msg}`,
    );
  }
}

dispatch().catch((err: unknown) => {
  const msg = err instanceof Error ? err.message : String(err);
  console.error(`\n  ${red("✘ Infrastructure teardown failed:")} ${msg}\n`);
  process.exit(1);
});
