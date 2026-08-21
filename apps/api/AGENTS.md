# VeoLMS API agent instructions

These instructions apply to every file under `apps/api`. They describe the
backend architecture from `veolms-backend-architecture (1).txt` and the
additional behavior-preservation requirements for this codebase.

The user's task-specific instructions always take precedence. When a task asks
for a behavior change, implement that explicit change and preserve everything
else. When a task asks only for refactoring, do not change business behavior or
the public API.

## 1. The goal of this architecture

The goal is not to create more folders or more abstractions. The goal is to
make every feature easy to understand, debug, test, review, and extend.

The default dependency direction is:

```text
Route -> Controller -> Service -> Repository -> Database
                         |
                         +-> Provider / Adapter / Email / SMS / Storage / Queue
```

Dependencies must point inward through the feature's application workflow.
HTTP code must not know how the database works. Database code must not decide
business policy. A provider must not decide whether an application workflow is
allowed.

The repository layer and transaction-aware repository functions are valuable
existing decisions. Keep them. A repository should accept either the normal
database executor or a transaction executor when the same query is needed in
both contexts.

## 2. Folder structure: choose the smallest structure that is sufficient

Do **not** create `controllers/`, `services/`, `repositories/`, or
`providers/` folders in every module merely because AUTH has them.

Folder depth is based on feature size and responsibility, not on a blanket
rule. Start every new module with the smallest structure that keeps its
responsibilities clear.

### Small or medium module: use a flat feature folder

For a small feature, use files directly inside the module folder:

```text
src/modules/courses/
├── courses.routes.ts
├── courses.controller.ts
├── courses.service.ts
├── courses.repository.ts
├── courses.presenters.ts       # only if response mapping is non-trivial
├── courses.constants.ts        # only if feature constants exist
├── courses.types.ts            # only for feature-owned types
└── courses.utils.ts            # only for feature-specific helpers
```

The flat structure changes file placement, not dependency direction. A normal
small feature still follows:

```text
courses.routes.ts -> courses.controller.ts -> courses.service.ts -> courses.repository.ts
```

Only a genuinely trivial endpoint with no business workflow, persistence, or
meaningful HTTP mapping may remain route-only. Do not omit a controller or
service from a real feature merely to avoid creating a folder, and do not
create an empty or ceremonial layer either.

The flat structure is the default for modules such as a small health check or
an early courses feature. A small module must still obey the dependency flow;
flat files do not permit route-to-repository or route-to-database shortcuts.

### Large module: split by responsibility

Use subfolders only when a feature has multiple independent workflows, several
owned persistence areas, multiple external providers, or files large enough to
become difficult to review or test. A large module may use:

```text
src/modules/<feature>/
├── <feature>.routes.ts
├── controllers/
├── services/
├── repositories/
├── providers/
├── <feature>.constants.ts
├── <feature>.presenters.ts
├── <feature>.types.ts
└── <feature>.utils.ts
```

Split an existing file when there is a real responsibility boundary. Do not
split one tiny function into one file, do not create empty directories, and do
not add interfaces or factories solely to make the tree look sophisticated.

### AUTH is the large-module reference implementation

AUTH is large enough to use the split structure because it contains OTP,
passwordless login/registration, OAuth, sessions, MFA/TOTP, passkeys, and
academy setup workflows:

```text
src/modules/auth/
├── routes/
│   ├── auth.routes.ts
│   ├── mfa.routes.ts
│   ├── oauth.routes.ts
│   ├── session.routes.ts
│   └── setup.routes.ts
├── controllers/
│   ├── auth.controller.ts
│   ├── oauth.controller.ts
│   ├── session.controller.ts
│   ├── mfa.controller.ts
│   └── setup.controller.ts
├── services/
│   ├── auth.service.ts
│   ├── otp.service.ts
│   ├── oauth.service.ts
│   ├── session.service.ts
│   ├── mfa.service.ts
│   └── setup.service.ts
├── repositories/
│   ├── user.repository.ts
│   ├── otp.repository.ts
│   ├── oauth.repository.ts
│   ├── session.repository.ts
│   ├── mfa.repository.ts
│   ├── academy.repository.ts
│   └── repository.types.ts
├── providers/
│   └── oauth.provider.ts
├── auth.constants.ts
├── auth.cookies.ts
├── auth.presenters.ts
├── auth.types.ts
├── auth.utils.ts
└── auth.context.ts
```

AUTH has multiple route plugin files grouped under `routes/` because Fastify
autoload recursively registers files ending in `.routes.ts`. Each AUTH route
plugin must remain route-only. Do not add a second plugin for an existing path,
rename a route plugin without checking autoload, or move a helper into a
filename that autoload will treat as a route.

The AUTH structure is a reference for a genuinely large module, not a template
that must be copied into every future module.

## 3. Responsibilities of each layer

### Route

A route answers: “What HTTP endpoint exists?”

Routes may contain:

- URL and HTTP method
- request, params, query, and response schemas
- OpenAPI operation metadata
- middleware and `preHandler` declarations
- the controller function to invoke

Routes must not contain:

- SQL or Kysely queries
- repository imports or calls
- database transactions
- multi-step business workflows
- core authorization or MFA policy
- provider calls
- large request transformations

### Controller

A controller answers: “How do I translate HTTP into an application call?”

Controllers may contain:

- reading `request.body`, `params`, `query`, and headers
- reading cookies and request IP/user-agent
- calling a service
- setting the reply status code
- setting or clearing cookies
- choosing a presenter or response mapper
- converting a service result into an HTTP response

Controllers must not contain:

- direct database or repository calls
- Kysely queries or transactions
- core business rules
- reusable workflows
- decisions that must be consistent across multiple endpoints

Simple HTTP input normalization, such as selecting an email or phone field,
is acceptable in a controller. The policy that follows that input belongs in a
service.

### Service

A service answers: “What should the application do?”

Services own:

- business rules and use-case workflows
- reusable application operations
- authorization decisions belonging to the use case
- database transactions and transaction boundaries
- calls to one or more repositories
- calls to external providers/adapters
- coordination of multiple steps
- domain/application errors

Example:

```text
loginWithOtp()
  1. Find the user
  2. Verify and consume the OTP
  3. Create the session
  4. Resolve MFA state
  5. Return the authenticated user and session result
```

A service should receive transport-independent values, not a Fastify request or
reply. Extract HTTP data in the controller and pass values such as
`userId`, `identifier`, `ip`, `userAgent`, and `cookieValue` instead.

### Repository

A repository answers: “How do I read or write owned persistence?”

Repositories contain:

- Kysely queries
- select, insert, update, and delete operations
- database-specific persistence details
- transaction-compatible executor parameters
- persistence input types when those types belong only to the query

Repositories must not:

- decide business policy
- decide authorization policy
- start application workflows
- call controllers or Fastify
- call another module's tables

For example, a repository may return whether a role exists. The service decides
what to do when the role is missing.

### Provider or adapter

Providers isolate third-party behavior such as OAuth, WebAuthn, email, SMS,
storage, queues, or payment gateways. They parse and validate untrusted
provider responses and expose application-friendly results. The service owns
the workflow decision around that result.

Third-party response shapes belong near the provider, not in
`@veolms/contracts`, unless the shape is part of VeoLMS's own public API.

## 4. The eleven team rules

### Rule 1: Routes define endpoints and delegate

Every endpoint must be discoverable from a route plugin. The route declares
the HTTP contract and delegates application work to a controller or, for a
genuinely trivial feature, its clear application service.

### Rule 2: Controllers handle HTTP only

Controllers are the transport boundary. Keep request/reply, cookies, headers,
status codes, and response mapping there. Do not turn a controller into a
second service.

### Rule 3: Controllers never call repositories

A controller must never import or call a repository, database executor, Kysely,
or transaction. If a controller needs data, it calls a service.

### Rule 4: Services contain business logic and workflows

Rules that affect what the product permits must be reusable from a service.
Do not duplicate a business rule in two route handlers or import one route from
another route to reuse it.

### Rule 5: Services own transactions

Transaction creation and transaction boundaries belong to services. Repository
functions must remain usable with either the normal executor or a transaction
executor. A route must never start a transaction.

### Rule 6: Repositories contain database access

Keep SQL/Kysely code in the repository owned by the module that owns the table.
Do not leak database row shapes or query details into routes when a service can
return an application result.

### Rule 7: Database code cannot leak into HTTP layers

Routes and controllers must not import `Kysely`, `Database`, or database query
helpers. If a route or controller needs a database-shaped value, stop and move
that work into the appropriate service/repository boundary.

### Rule 8: Keep types close to their owner

Do not create one giant types file for the entire backend.

- Public request/response contracts belong in `@veolms/contracts`.
- Service-specific inputs/results belong in the service or feature types file.
- Repository input/query types belong in the repository or repository types file.
- Third-party provider response types belong in the provider.
- Fastify request augmentation belongs in the API type declarations.

Only place a type in a shared module when multiple layers genuinely share it.

### Rule 9: Keep modules isolated

Each module owns its business logic, repositories, and database tables.

For example, a Courses route must not directly query Auth tables. If Courses
needs Auth functionality, it must call an Auth public service/use case or use an
appropriate event.

### Rule 10: Do not create abstractions without a reason

Do not force Clean Architecture with many extra layers, CQRS everywhere, event
sourcing everywhere, interfaces for every class, dependency injection for
every function, or one file for every tiny function. Add an abstraction only
when it solves a real coupling, testing, reuse, or ownership problem.

Consistency matters more than architectural vocabulary.

### Rule 11: Cross-module communication is explicit

Synchronous communication must use the owning module's public service:

```text
Module A Service -> Module B Public Service -> Module B Repository -> Module B Tables
```

Never do this:

```text
Module A Service -> Module B Repository       # forbidden
Module A Repository -> Module B Tables       # forbidden
```

If the other module does not need to respond immediately, publish a domain
event instead:

```text
Module A -> Domain Event -> Analytics / Certificates / Notifications
```

Never import another module's private repository or query another module's
owned tables directly. This keeps modules independent and allows an internal
implementation to change without breaking consumers.

## 5. HTTP contracts and behavior preservation

Unless a task explicitly requests an API change, a refactor must preserve:

- route URLs and HTTP methods
- request and response schemas
- OpenAPI operation IDs and documented behavior
- success and error status codes
- error codes and client-visible messages
- response envelope shape
- cookies, cookie names, signing, expiry, and clearing behavior
- authentication, authorization, MFA, CSRF, and rate-limit behavior
- transaction boundaries and concurrency protections
- provider security checks and failure handling
- database writes and business rules

Do not “clean up” business logic while moving files. If existing behavior looks
wrong but the task is architectural, record it separately instead of changing
it silently.

When moving code, preserve security-sensitive ordering. Examples include
checking account existence before consuming an OTP, validating OAuth state
before exchanging a code, consuming WebAuthn challenges once, and enforcing MFA
step-up before factor replacement.

## 6. Route registration and Fastify autoload

`apps/api/src/app.ts` autoloads files under `src/modules` whose names end in
`.routes.ts`. Therefore:

- every route plugin must default-export the expected `RoutePlugin`;
- route paths must be unique;
- do not register the same endpoint from two files;
- do not put non-route helpers in a `.routes.ts` filename;
- preserve the API prefix configured by the application;
- audit the complete route list after moving files.

Route schemas should remain next to the route declaration unless the project
already has a deliberate shared schema module. Shared public contracts belong
in `@veolms/contracts`.

## 7. Safe implementation workflow for AI agents

Before changing a module:

1. Read the module's route files, controllers, services, repositories,
   providers, contracts, middleware, and tests together.
2. Search all imports and route registration points before renaming or deleting
   a file.
3. Check for existing uncommitted work and preserve unrelated changes.
4. Identify the public behavior that must remain unchanged.
5. Choose the smallest folder structure that solves the actual problem.

While changing code:

1. Move behavior without rewriting it unnecessarily.
2. Keep dependency direction one-way.
3. Keep transactions in services and database details in repositories.
4. Keep controllers free of reusable business rules.
5. Do not add cross-module repository/table imports.
6. Do not create folders or abstractions without a concrete reason.

After changing code:

1. Run the narrowest relevant tests.
2. Run the API typecheck.
3. Run formatting and lint checks for changed files.
4. Audit route registration for missing or duplicate endpoints.
5. Search routes/controllers for database and repository imports.
6. Review the diff for accidental contract, cookie, status, or transaction
   changes.
7. Report pre-existing failures separately from failures caused by the change.

## 8. Review checklist

Before considering a backend change complete, verify:

- Is the module still using the smallest reasonable folder structure?
- Does every route delegate instead of containing a workflow?
- Does every controller handle HTTP only?
- Are business rules in a service?
- Are transactions owned by services?
- Are all database queries in the owning repository?
- Are external integrations isolated behind providers/adapters?
- Are types located near the layer that owns them?
- Are cross-module calls going through public services or events?
- Are routes, schemas, errors, cookies, statuses, and security behavior intact?
- Are tests/typecheck/lint/formatting and route audits complete?

Keep the architecture simple, predictable, and consistent. Add more structure
only when a real feature-size or ownership problem requires it.
