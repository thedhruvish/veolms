# VeoLMS Documentation

Welcome to the VeoLMS technical and contributor documentation.

---

## 📑 Documentation Index

### 1. Architecture & Design

- [**Architecture Overview**](./architecture.md): System boundaries, applications (`apps/web`, `apps/api`, `apps/fleet-manager`, `apps/media-worker`), and shared packages.

### 2. Local Development & Setup

- [**Development Guide**](./development.md): Detailed local setup instructions, Docker PostgreSQL vs host PostgreSQL, database workflows, migrations, seeds, and static builds.

### 3. Contribution & Community Guidelines

- [**Contribution Overview & Index**](./contribution/README.md): Master guide for contributing to VeoLMS.
  - 🚀 [**Getting Started with Forking & Setup**](./contribution/getting-started.md): Forking the repo, remote configuration, local environment, and branch naming.
  - 📝 [**Git Commit Guidelines**](./contribution/commit-guidelines.md): Conventional Commits standards and mandatory pre-commit verification (`pnpm format`, `pnpm lint`, `pnpm verify`).
  - 🔀 [**Pull Requests**](./contribution/pull-requests.md): Submitting, structuring, and reviewing pull requests.
  - ✍️ [**Spelling & Minor Edits Policy**](./contribution/spelling-and-typos.md): Guidance on batching minor typo corrections and avoiding spam PRs.
  - 🔒 [**Security Disclosure Policy**](./contribution/security.md) & [**Root Security Policy**](../SECURITY.md): Responsible vulnerability reporting via email (do NOT file public issues).
  - 🤝 [**Code of Conduct**](../CODE_OF_CONDUCT.md): Community participation standards and pledge.

### 4. Product Planning & Roadmap

- [**V1 Product Planning**](./v1-product-planning/): Design reviews, feature lists, and development review notes.

---

## 🧭 Repository Structure

```text
veolms/
├── apps/
│   ├── api/             # Fastify API service
│   ├── web/             # React Router static frontend
│   ├── fleet-manager/   # Future infrastructure reconciliation service shell
│   └── media-worker/    # Future media processing worker shell
├── packages/
│   ├── config/          # Shared environment validation
│   ├── contracts/       # Public course contracts
│   └── database/        # Kysely client, migrations, seeds, queries
└── docs/                # Architecture, development, and contribution documentation
    ├── architecture.md
    ├── development.md
    ├── README.md        # This index
    └── contribution/    # Contributor guides
```
