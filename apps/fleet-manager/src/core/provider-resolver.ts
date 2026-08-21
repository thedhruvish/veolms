import type { FleetProvider } from "@veolms/fleet-types";
import { loadModuleFunction } from "./dynamic-module.ts";

/**
 * Single source of truth for "which provider name did the caller mean,"
 * used by config.ts, cli.ts's infra case, and destroy.ts alike. Previously
 * each of those three implemented this independently with different
 * precedence orders (PROVIDER-first vs FLEET_PROVIDER-first) and different
 * treatment of an explicit-but-empty value, so the same environment could
 * resolve to different providers depending on which command ran.
 *
 * Precedence: an explicit override (e.g. a --provider CLI flag) always
 * wins; otherwise PROVIDER, then FLEET_PROVIDER. An empty/whitespace-only
 * string is treated the same as unset at every level, so e.g.
 * `FLEET_PROVIDER=""` can't force an invalid empty PROVIDER downstream.
 */
export function resolveProviderName(
  explicit: string | undefined,
  env: Readonly<Record<string, string | undefined>>,
): string | undefined {
  if (typeof explicit === "string" && explicit.trim() !== "") {
    return explicit.trim().toLowerCase();
  }
  for (const key of ["PROVIDER", "FLEET_PROVIDER"] as const) {
    const value = env[key];
    if (typeof value === "string" && value.trim() !== "") {
      return value.trim().toLowerCase();
    }
  }
  return undefined;
}

export async function resolveFleetProvider(
  providerName: string,
  options?: unknown,
): Promise<FleetProvider> {
  const normalized = providerName.trim().toLowerCase();
  const packageName = normalized.startsWith("@")
    ? normalized
    : `@veolms/fleet-provider-${normalized}`;

  try {
    const factory = await loadModuleFunction<(opts?: unknown) => FleetProvider>(
      packageName,
      ["createProvider", "createAwsProvider", "createLocalProvider", "default"],
      `Package "${packageName}" did not export a valid provider factory function.`,
    );
    return factory(options);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(
      `[fleet-manager] Could not load provider "${providerName}" (${packageName}). Run "pnpm fleet:provider" to select and install it. Details: ${message}`,
    );
  }
}
