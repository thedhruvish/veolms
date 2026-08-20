import type { FleetProvider } from "@veolms/fleet-types";
import { loadModuleFunction } from "./dynamic-module.ts";

export async function resolveFleetProvider(
  providerName: string,
  options?: unknown,
): Promise<FleetProvider> {
  const normalized = providerName.trim().toLowerCase();
  const packageName = normalized.startsWith("@")
    ? normalized
    : `@veolms/fleet-provider-${normalized}`;

  try {
    const factory = await loadModuleFunction<
      (opts?: unknown) => FleetProvider
    >(
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
