import { STATUS_CODES } from "node:http";

import { z } from "zod";

import { jsonResponse } from "./responses.ts";

const validationIssueSchema = z.object({
  path: z.string().meta({
    description: "Location of the offending value, e.g. `/slug`.",
  }),
  message: z.string().meta({ description: "What was wrong with that value." }),
});

export const errorResponseSchema = z.object({
  statusCode: z
    .number()
    .int()
    .meta({ description: "HTTP status code, repeated in the body." }),
  code: z.string().meta({ description: "Stable machine-readable error code." }),
  error: z.string().meta({ description: "HTTP status phrase." }),
  message: z.string().meta({ description: "Human-readable explanation." }),
  issues: z
    .array(validationIssueSchema)
    .optional()
    .meta({ description: "Only present when request validation failed." }),
});

z.globalRegistry.add(errorResponseSchema, {
  id: "ErrorResponse",
  description: "The shape of every non-2xx response this API returns.",
});

export type ErrorResponse = z.output<typeof errorResponseSchema>;

export type ValidationIssue = z.output<typeof validationIssueSchema>;

/** Declares a failure response pointing at the shared `ErrorResponse`. */
export function errorResponse(description: string) {
  return jsonResponse(description, errorResponseSchema);
}

export function httpError(
  statusCode: number,
  code: string,
  message: string,
  issues?: ValidationIssue[],
): ErrorResponse {
  return {
    statusCode,
    code,
    error: STATUS_CODES[statusCode] ?? "Error",
    message,
    ...(issues ? { issues } : {}),
  };
}
