import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { verifyApiKeyAuth } from "../src/utils/auth.ts";

describe("API Key Authentication Utility (verifyApiKeyAuth)", () => {
  it("should allow public /health check without API key", () => {
    const result = verifyApiKeyAuth("/health", {}, "secret-key-123");
    assert.equal(result.authorized, true);
    assert.equal(result.error, undefined);
  });

  it("should allow any route if no FLEET_API_KEY is configured", () => {
    const result = verifyApiKeyAuth("/api/v1/fleet/status", {}, undefined);
    assert.equal(result.authorized, true);
  });

  it("should reject /api/ routes when configured API key is missing from headers", () => {
    const result = verifyApiKeyAuth(
      "/api/v1/fleet/status",
      {},
      "secret-key-123",
    );
    assert.equal(result.authorized, false);
    assert.match(result.error || "", /Unauthorized/i);
  });

  it("should reject when invalid key is provided in Authorization header", () => {
    const result = verifyApiKeyAuth(
      "/api/v1/workers/register",
      { authorization: "Bearer wrong-key" },
      "secret-key-123",
    );
    assert.equal(result.authorized, false);
  });

  it("should accept valid key via Authorization: Bearer <key>", () => {
    const result = verifyApiKeyAuth(
      "/api/v1/workers/register",
      { authorization: "Bearer secret-key-123" },
      "secret-key-123",
    );
    assert.equal(result.authorized, true);
  });

  it("should accept valid key via x-api-key header", () => {
    const result = verifyApiKeyAuth(
      "/api/v1/workers/worker-1/heartbeat",
      { "x-api-key": "secret-key-123" },
      "secret-key-123",
    );
    assert.equal(result.authorized, true);
  });

  it("should accept valid key via uppercase X-Api-Key header", () => {
    const result = verifyApiKeyAuth(
      "/api/v1/fleet/cycle",
      { "X-Api-Key": "secret-key-123" },
      "secret-key-123",
    );
    assert.equal(result.authorized, true);
  });
});
