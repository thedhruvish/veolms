/**
 * VeoLMS Fleet Manager — Infrastructure Setup Dispatcher
 *
 * Reads FLEET_PROVIDER from environment and delegates to the
 * corresponding provider package's own setup module:
 *
 *   FLEET_PROVIDER=aws   → @veolms/fleet-provider-aws/setup
 *   FLEET_PROVIDER=local → @veolms/fleet-provider-local/setup
 *   FLEET_PROVIDER=gcp   → @veolms/fleet-provider-gcp/setup  (future)
 *
 * Usage:
 *   FLEET_PROVIDER=aws pnpm fleet:infra
 *   pnpm fleet:infra                     # reads from apps/fleet-manager/.env
 */

import { bold, cyan, dim, red } from "@veolms/fleet-types/terminal";
import { loadModuleFunction } from "./core/dynamic-module.ts";

const provider = (process.env["FLEET_PROVIDER"] ?? "").toLowerCase().trim();

if (!provider) {
  console.error(`
  ${red("✘ FLEET_PROVIDER is not set.")}

  Set it before running infra setup:

    ${bold("Option 1 — Environment variable:")}
      ${cyan("FLEET_PROVIDER=aws pnpm fleet:infra")}
      ${cyan("FLEET_PROVIDER=local pnpm fleet:infra")}

    ${bold("Option 2 — .env file")} ${dim("(apps/fleet-manager/.env):")}
      ${cyan('FLEET_PROVIDER="aws"')}

  ${bold("Supported providers:")}
    ${bold("aws")}   — AWS EC2 Graviton workers with IAM, Lambda, CloudWatch, S3
    ${bold("local")} — Local child process workers (development / testing)
    ${bold("gcp")}   — Google Cloud Platform workers ${dim("(future)")}
`);
  process.exit(1);
}

async function dispatch(): Promise<void> {
  if (provider === "gcp" || provider === "azure") {
    console.error(`
  ${red(`✘ ${provider.toUpperCase()} provider setup is not yet implemented.`)}

  The ${provider.toUpperCase()} provider is planned for a future release.
  For now, use ${bold("aws")} or ${bold("local")} as your FLEET_PROVIDER.
`);
    process.exit(1);
  }

  const packageName = `@veolms/fleet-provider-${provider}/setup`;

  try {
    const setupFn = await loadModuleFunction<() => Promise<void>>(
      packageName,
      ["runAwsInfraSetup", "runLocalInfraSetup", "runInfraSetup", "default"],
      `Provider setup package "${packageName}" does not export a setup function.`,
    );
    await setupFn();
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(
      `Failed to load setup module for provider "${provider}" (${packageName}). Run "pnpm fleet:provider" to install it. Details: ${msg}`,
    );
  }
}

dispatch().catch((err: unknown) => {
  const msg = err instanceof Error ? err.message : String(err);
  console.error(`\n  ${red("✘ Infrastructure setup failed:")} ${msg}\n`);
  process.exit(1);
});
