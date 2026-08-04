# @veolms/api

Fastify API for VEOLMS. Interactive docs are served at
<http://127.0.0.1:4000/api/docs>, with the raw document at `/api/docs/json` and
`/api/docs/yaml`.

## Adding an endpoint

Create a file in [src/routes](src/routes) that default-exports a `RoutePlugin`.
That is the whole procedure — the file is registered automatically and its
OpenAPI entry is generated from the same schemas that validate traffic, so there
is no separate documentation step and nothing to regenerate.

```ts
import { z } from "zod";

import { jsonResponse } from "../lib/responses.ts";
import type { RoutePlugin } from "../lib/route-plugin.ts";

const lessonRoutes: RoutePlugin = async (app, { database }) => {
  app.get(
    "/lessons/:id",
    {
      schema: {
        operationId: "getLesson",
        tags: ["Lessons"],
        summary: "Get a lesson by id",
        params: z.object({ id: z.uuid() }),
        response: {
          200: jsonResponse("The lesson.", lessonSchema),
          404: errorResponse("No lesson has that id."),
        },
      },
    },
    async (request) => {
      // request.params.id is typed and already validated
    },
  );
};

export default lessonRoutes;
```

Notes:

- Paths are relative to the `/api/v1` prefix that
  [src/app.ts](src/app.ts) applies.
- `request.params`, `request.query` and `request.body` are typed from the Zod
  schemas, and responses are serialised through them — returning a field a route
  did not declare is an error rather than a silent leak.
- New `tags` values should be added to `OPENAPI_TAGS` in
  [src/openapi.ts](src/openapi.ts) so the group gets a description.
- Files whose name starts with `_` are not loaded, for route-local helpers.
- Contracts shared with the web app live in `@veolms/contracts`. Registering one
  in `z.globalRegistry` (see
  [packages/contracts/src/course.ts](../../packages/contracts/src/course.ts))
  publishes it as a reusable `components.schemas` entry instead of an inline
  copy.

## Running

```bash
pnpm dev:api
```

Set `API_DOCS_ENABLED=false` to keep the API running without exposing Swagger UI.
`/api/docs/json` goes away with it.
