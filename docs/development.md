# Development

## Install dependencies

```bash
pnpm install
```

## Database options

VeoLMS requires PostgreSQL 18. Choose either Docker or a native PostgreSQL installation. The application, migrations, seed command, and resulting schema work identically in both cases; only `DATABASE_URL` and how PostgreSQL is started differ.

### Option A: Docker Compose (recommended)

Docker provides a reproducible, isolated PostgreSQL 18 environment and requires no host-level database configuration.

```bash
pnpm compose:up
pnpm db:migrate
pnpm db:seed
pnpm dev
```

Compose runs `postgres:18-alpine`, publishes PostgreSQL on host port `5433`, and stores its data in the persistent `veolms-postgres-18-data` named volume. The default validated connection URL is:

```text
postgresql://veolms:veolms@localhost:5433/veolms
```

Run `pnpm compose:down` to stop PostgreSQL. The named volume preserves local data.

### Option B: Native PostgreSQL 18

Use a native installation when Docker Desktop consumes too much memory or when PostgreSQL 18 is already installed. Install PostgreSQL 18 from the [official PostgreSQL downloads](https://www.postgresql.org/download/) and ensure its service is running.

Create the local role and database through `psql`, pgAdmin, or an equivalent administration tool. With `psql`:

```sql
CREATE ROLE veolms WITH LOGIN PASSWORD 'veolms';
CREATE DATABASE veolms OWNER veolms;
```

Copy `.env.example` to `.env` and point `DATABASE_URL` at the native server. Native installations commonly use port `5432`:

```env
DATABASE_URL=postgresql://veolms:veolms@localhost:5432/veolms
```

Do not run `pnpm compose:up` for this option. Once the native server and database are ready, use the same application commands:

```bash
pnpm db:migrate
pnpm db:seed
pnpm dev
```

The migration creates the schema and the idempotent seed inserts the three initial published courses. `pnpm db:reset` rolls migrations back and reapplies them, removing existing course data; run `pnpm db:seed` afterward.

## Platform resource notes

- **Linux:** Docker Engine uses the host Linux kernel, so it does not need a separate Linux virtual machine and generally has the lowest virtualization overhead.
- **Windows:** Docker Desktop runs Linux containers through WSL2. The shared WSL2 utility VM appears in Task Manager as `VmmemWSL` and can retain Linux kernel and filesystem cache memory even after containers stop. Stopping containers is not the same as stopping Docker Desktop. On a memory-constrained Windows computer, a native PostgreSQL installation is often the lighter option. See the [Docker WSL2 documentation](https://docs.docker.com/desktop/features/wsl/).
- **macOS:** Docker Desktop also requires a Linux virtual machine because macOS does not provide a Linux kernel. Docker Resource Saver can stop that VM while idle, but Docker still has more overhead than a native PostgreSQL installation. See the [Docker Resource Saver documentation](https://docs.docker.com/desktop/use-desktop/resource-saver/).

To fully release Docker and WSL memory on Windows after stopping the Compose services:

```powershell
pnpm compose:down
docker desktop stop
wsl --shutdown
```

`wsl --shutdown` stops every running WSL distribution, so do not use it while other WSL work must remain active.

## Run the applications

The Web application runs at `http://localhost:3000` and proxies `/api` requests to the API at `http://localhost:4000`. Set `WEB_PORT` in `.env` to override the frontend port. `pnpm dev` starts only Web and API; the fleet manager and media worker remain inactive shells.

API logs are formatted for readability in development by default. Set `API_DEV_PRETTY_LOGS=false` in `.env` to keep the original JSON log format. This setting is development-only; production logs always remain structured JSON.

## Static Web build

The static build requires PostgreSQL to be healthy, migrations and seed data to be present, and the API to be running:

```bash
pnpm dev:api
pnpm build:web
```

During the build, React Router uses `STATIC_BUILD_API_URL` to discover published course slugs and fetch their content. It writes deployable static files, including one HTML page per course, to `apps/web/build/client`. Browser navigation continues to use the relative `VITE_API_BASE_URL` path.
