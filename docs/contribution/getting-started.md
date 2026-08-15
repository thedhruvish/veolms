# Getting Started with Contributing

Thank you for contributing to VeoLMS! This guide will walk you through setting up your local development environment using a personal GitHub fork.

---

## 1. Prerequisites

Before you begin, ensure you have the following tools installed:

- **Node.js**: `v24 LTS` (engines: `>=24 <25`)
- **pnpm**: `v11` (engines: `>=11 <12`)
- **Docker & Docker Compose**: Recommended for local PostgreSQL 18 database service
- **Git**: For version control

Verify your versions:

```bash
node -v   # Should be v24.x
pnpm -v   # Should be v11.x
docker -v
git --version
```

---

## 2. Fork the Repository

1. Navigate to the upstream [VeoLMS repository](https://github.com/veolms/veolms).
2. Click the **Fork** button in the top-right corner to create a copy in your personal GitHub account.
3. Keep the default options and click **Create fork**.

---

## 3. Clone Your Fork Locally

Clone your personal fork to your local development machine:

```bash
# Using SSH (recommended)
git clone git@github.com:<YOUR_GITHUB_USERNAME>/veolms.git
cd veolms

# Or using HTTPS
git clone https://github.com/<YOUR_GITHUB_USERNAME>/veolms.git
cd veolms
```

---

## 4. Configure Remotes

Configure the original upstream repository so you can sync changes:

```bash
# Add upstream remote
git remote add upstream https://github.com/veolms/veolms.git

# Verify remotes
git remote -v
```

You should see:

- `origin`: pointing to your personal fork (`<YOUR_GITHUB_USERNAME>/veolms`)
- `upstream`: pointing to the canonical repository (`veolms/veolms`)

To fetch and rebase the latest upstream changes at any time:

```bash
git checkout development
git fetch upstream
git rebase upstream/development
git push origin development
```

---

## 5. Install Dependencies and Setup Environment

1. **Install workspace dependencies**:

   ```bash
   pnpm install
   ```

2. **Configure environment variables**:

   ```bash
   cp .env.example .env
   ```

   Inspect `.env` and verify database and service URLs.

3. **Start PostgreSQL database container**:

   ```bash
   pnpm compose:up
   ```

4. **Run migrations and seed data**:

   ```bash
   pnpm db:migrate
   pnpm db:seed
   ```

5. **Start development servers**:
   ```bash
   pnpm dev
   ```
   - API runs at: `http://localhost:4000`
   - Web frontend runs at: `http://localhost:3000`

---

## 6. Create a Feature Branch

> [!IMPORTANT]
> **Branch Rule: Never branch off, push to, or target the `main` branch.**
> All active development in VeoLMS happens against the `development` branch. Always base your feature branches on `upstream/development`.

```bash
# Ensure your local development branch is up to date with upstream
git checkout development
git fetch upstream
git rebase upstream/development

# Create a new feature/bugfix branch off development
git checkout -b feat/course-filtering
# or
git checkout -b fix/api-response-schema
```

### Branch Naming Conventions

Use lowercase names with descriptive prefixes:

| Branch Prefix | Purpose                                     | Example                      |
| :------------ | :------------------------------------------ | :--------------------------- |
| `feat/`       | New features or enhancements                | `feat/auth-token-refresh`    |
| `fix/`        | Bug fixes                                   | `fix/kysely-connection-leak` |
| `docs/`       | Documentation improvements                  | `docs/architecture-update`   |
| `refactor/`   | Code refactoring without behavioral changes | `refactor/database-queries`  |
| `test/`       | Adding or updating tests                    | `test/course-contracts`      |
| `chore/`      | Tooling, dependencies, or maintenance       | `chore/upgrade-turborepo`    |

---

## 7. Finding Issues & Contribution Etiquette

Before you start writing code:

1. **Browse Existing Issues**:
   - Check the [GitHub Issues tracker](https://github.com/veolms/veolms/issues).
   - Filter by labels such as `good first issue`, `help wanted`, or `documentation`.
2. **Claim Before You Code**:
   - Leave a comment on the issue stating your interest in working on it.
   - Wait for a maintainer to assign you to the issue before beginning work. This prevents multiple contributors from unknowingly duplicating effort on the same problem.
3. **Propose Major Changes First**:
   - If you want to introduce a significant architectural change or new feature that doesn't already have an open issue, open a **Feature Request** issue or start a GitHub Discussion to discuss design and feasibility before writing code.
4. **Adhere to the Code of Conduct**:
   - All interactions and contributions are governed by our [Code of Conduct](../../CODE_OF_CONDUCT.md). Please be respectful and constructive.

