# Architecture

VeoLMS currently has four application boundaries:

- **Web** is a React Router application that reads public course data through the API and builds to static files.
- **API** is the Fastify service that owns public HTTP endpoints and accesses PostgreSQL through Kysely.
- **Fleet Manager** is an unimplemented shell for a future infrastructure reconciliation service. It will not run jobs.
- **Media Worker** is an unimplemented shell for future media processing that will run independently from the API.

Shared packages contain only validated configuration, public course contracts, and database access needed by the current course catalogue slice.
