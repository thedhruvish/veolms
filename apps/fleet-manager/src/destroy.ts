/**
 * VeoLMS Fleet Manager — Infrastructure Destroy Dispatcher
 *
 * Reads FLEET_PROVIDER from environment and delegates to the
 * corresponding provider package's own destroy module.
 *
 * Usage:
 *   pnpm fleet:destroy
 */

const provider = (process.env["FLEET_PROVIDER"] ?? "aws").toLowerCase().trim();

function bold(s: string): string {
  return `\x1b[1m${s}\x1b[0m`;
}
function red(s: string): string {
  return `\x1b[31m${s}\x1b[0m`;
}

async function dispatch(): Promise<void> {
  const packageName = `@veolms/fleet-provider-${provider}/destroy`;

  try {
    const destroyModule = (await import(packageName)) as Record<
      string,
      unknown
    >;
    const destroyFn =
      destroyModule.runAwsInfraDestroy ??
      destroyModule.runLocalInfraDestroy ??
      destroyModule.runInfraDestroy ??
      destroyModule.default;

    if (typeof destroyFn === "function") {
      await (destroyFn as () => Promise<void>)();
      return;
    }

    throw new Error(
      `Provider destroy package "${packageName}" does not export a destroy function.`,
    );
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
