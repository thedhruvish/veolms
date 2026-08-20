import type { FleetProvider } from "@veolms/fleet-types";

export async function resolveFleetProvider(
  providerName: string,
  options?: unknown,
): Promise<FleetProvider> {
  const normalized = providerName.trim().toLowerCase();
  const packageName = normalized.startsWith("@")
    ? normalized
    : `@veolms/fleet-provider-${normalized}`;

  try {
    const providerModule = (await import(packageName)) as Record<
      string,
      unknown
    >;

    const factory =
      providerModule.createProvider ??
      providerModule.createAwsProvider ??
      providerModule.createLocalProvider ??
      providerModule.default;

    if (typeof factory === "function") {
      return (factory as (opts?: unknown) => FleetProvider)(options);
    }

    throw new Error(
      `Package "${packageName}" did not export a valid provider factory function.`,
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(
      `[fleet-manager] Could not load provider "${providerName}" (${packageName}). Run "pnpm fleet:provider" to select and install it. Details: ${message}`,
    );
  }
}
