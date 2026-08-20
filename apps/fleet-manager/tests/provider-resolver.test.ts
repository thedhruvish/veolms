import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolveFleetProvider } from "../src/core/provider-resolver.ts";

describe("Pluggable Provider Resolver", () => {
  it("should attempt to resolve provider package dynamically", async () => {
    // When resolving an unknown provider, it throws a clear actionable error
    await assert.rejects(
      async () => {
        await resolveFleetProvider("nonexistent-cloud");
      },
      (err: Error) => {
        assert.match(
          err.message,
          /Could not load provider "nonexistent-cloud"/,
        );
        assert.match(
          err.message,
          /Run "pnpm fleet:provider" to select and install it/,
        );
        return true;
      },
    );
  });
});
