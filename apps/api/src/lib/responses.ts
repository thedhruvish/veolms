/**
 * Declares a JSON response with a status-specific description.
 *
 * `@fastify/swagger` takes a response description from the schema sitting at
 * `response[status]`, which does not work for a schema published as a reusable
 * component: attaching the text with `.meta()` clones the Zod schema, and the
 * clone is not the object registered in `z.globalRegistry`, so the response
 * would inline a copy of the shape instead of referencing the component. The
 * long-hand `content` form keeps the description beside the `$ref`.
 */
export function jsonResponse<Schema>(description: string, schema: Schema) {
  return {
    description,
    content: { "application/json": { schema } },
  };
}
