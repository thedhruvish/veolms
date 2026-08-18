import type { IncomingHttpHeaders } from "node:http";

export interface ApiKeyAuthResult {
  readonly authorized: boolean;
  readonly error?: string;
}

/**
 * Validates API key authentication for incoming Fleet Manager requests.
 * Accepts API key via `Authorization: Bearer <key>`, `Authorization: <key>`, or `x-api-key: <key>`.
 *
 * Returns `{ authorized: true }` if:
 * 1. Path does not require auth (e.g. `/health` or not starting with `/api/`)
 * 2. No `FLEET_API_KEY` is configured (auth disabled by default)
 * 3. Provided API key matches `FLEET_API_KEY`
 */
export function verifyApiKeyAuth(
  pathname: string,
  headers: Record<string, string | string[] | undefined> | IncomingHttpHeaders,
  configuredApiKey: string | undefined = process.env.FLEET_API_KEY,
): ApiKeyAuthResult {
  if (!pathname.startsWith("/api/")) {
    return { authorized: true };
  }

  if (!configuredApiKey) {
    return { authorized: true };
  }

  const rawAuth = headers["authorization"] || headers["Authorization"];
  const authHeader = Array.isArray(rawAuth) ? rawAuth[0] : rawAuth;

  const rawXApiKey =
    headers["x-api-key"] || headers["X-Api-Key"] || headers["X-API-KEY"];
  const xApiKeyHeader = Array.isArray(rawXApiKey) ? rawXApiKey[0] : rawXApiKey;

  const bearerToken = authHeader?.startsWith("Bearer ")
    ? authHeader.substring(7).trim()
    : authHeader?.trim();

  const providedKey = (bearerToken || xApiKeyHeader || "").trim();

  if (providedKey !== configuredApiKey) {
    return {
      authorized: false,
      error: "Unauthorized: Invalid or missing API key",
    };
  }

  return { authorized: true };
}
