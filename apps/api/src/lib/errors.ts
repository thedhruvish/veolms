import { STATUS_CODES } from "node:http";
import { z } from "zod";
import { errorJsonResponse } from "./responses.ts";

const validationIssueSchema = z.strictObject({
  path: z.string().meta({
    description: "Location of the offending value, e.g. `/slug`.",
  }),
  message: z.string().meta({ description: "What was wrong with that value." }),
});

export const errorResponseSchema = z.strictObject({
  success: z.literal(false),
  statusCode: z.number().int(),
  error: z.strictObject({
    code: z
      .string()
      .meta({ description: "Stable machine-readable error code." }),
    message: z.string().meta({ description: "Human-readable explanation." }),
    issues: z
      .array(validationIssueSchema)
      .optional()
      .meta({ description: "Only present when request validation failed." }),
  }),
});

z.globalRegistry.add(errorResponseSchema, {
  id: "ErrorResponse",
  description: "The shape of every non-2xx response this API returns.",
});

export type ErrorResponse = z.output<typeof errorResponseSchema>;
export type ValidationIssue = z.output<typeof validationIssueSchema>;

export function errorResponse(description: string) {
  return errorJsonResponse(description, errorResponseSchema);
}

export function httpError(
  statusCode: number,
  code: string,
  message: string,
  issues?: ValidationIssue[],
): ErrorResponse {
  return {
    success: false,
    statusCode,
    error: {
      code,
      message,
      ...(issues ? { issues } : {}),
    },
  };
}
