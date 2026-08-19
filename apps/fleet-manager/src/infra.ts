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

const provider = (process.env["FLEET_PROVIDER"] ?? "").toLowerCase().trim();

function bold(s: string): string {
  return `\x1b[1m${s}\x1b[0m`;
}
function red(s: string): string {
  return `\x1b[31m${s}\x1b[0m`;
}
function cyan(s: string): string {
  return `\x1b[36m${s}\x1b[0m`;
}
function dim(s: string): string {
  return `\x1b[2m${s}\x1b[0m`;
}

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
  switch (provider) {
    case "aws": {
      const { runAwsInfraSetup } =
        await import("@veolms/fleet-provider-aws/setup");
      await runAwsInfraSetup();
      break;
    }

    case "local": {
      const { runLocalInfraSetup } =
        await import("@veolms/fleet-provider-local/setup");
      await runLocalInfraSetup();
      break;
    }

    case "gcp":
      console.error(`
  ${red("✘ GCP provider setup is not yet implemented.")}

  The GCP provider is planned for a future release.
  For now, use ${bold("aws")} or ${bold("local")} as your FLEET_PROVIDER.
`);
      process.exit(1);
      break;

    default:
      console.error(`
  ${red(`✘ Unknown FLEET_PROVIDER: "${provider}"`)}

  ${bold("Supported providers:")}
    ${bold("aws")}   — AWS EC2 + Lambda + CloudWatch + S3
    ${bold("local")} — Local child processes (development)
    ${bold("gcp")}   — Google Cloud Platform ${dim("(future)")}

  ${bold("Example:")}
    ${cyan("FLEET_PROVIDER=aws pnpm fleet:infra")}
`);
      process.exit(1);
  }
}

dispatch().catch((err: unknown) => {
  const msg = err instanceof Error ? err.message : String(err);
  console.error(`\n  ${red("✘ Infrastructure setup failed:")} ${msg}\n`);
  process.exit(1);
});
