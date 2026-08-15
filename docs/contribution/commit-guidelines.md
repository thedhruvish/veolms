# Git Commit Guidelines & Quality Checks

VeoLMS enforces structured commit messages based on the [Conventional Commits](https://www.conventionalcommits.org/) specification. Following these rules ensures clean git history, automated changelog generation, and streamlined code reviews.

---

## 1. Commit Message Structure

Every commit message must follow this format:

```text
<type>(<scope>): <short summary>

[optional body explaining motivation and details]

[optional footer(s) for breaking changes and issue references]
```

### Example

```text
feat(api): add pagination support to courses endpoint

Introduce `page` and `limit` query parameters with Zod validation.
Default to page 1 and limit 20 items per request.

Closes #42
```

---

## 2. Commit Types

Use one of the following commit types:

| Type       | Description                                                      |
| :--------- | :--------------------------------------------------------------- |
| `feat`     | Adds a new feature or functionality                              |
| `fix`      | Fixes a bug                                                      |
| `docs`     | Documentation changes only                                       |
| `refactor` | Code change that neither fixes a bug nor adds a feature          |
| `perf`     | Code change that improves performance                            |
| `test`     | Adding missing tests or correcting existing tests                |
| `build`    | Changes affecting the build system or external dependencies      |
| `ci`       | Changes to CI configuration files and scripts                    |
| `chore`    | Routine maintenance, tooling, or repository tasks                |
| `style`    | Formatting, whitespace, or style changes (no code logic changes) |

---

## 3. Scopes

The scope specifies the portion of the codebase affected:

- `api` (`apps/api`)
- `web` (`apps/web`)
- `database` (`packages/database`)
- `contracts` (`packages/contracts`)
- `config` (`packages/config`)
- `deps` (Dependency updates)
- `docs` (Documentation files)
- `ci` (Workflows and automation)

_Example_: `fix(database): correct column type in migration script`

---

## 4. Writing Good Commit Messages

- **Use imperative mood in the summary**: Write `"add feature"` instead of `"added feature"` or `"adds feature"`.
- **Keep the summary concise**: Maximum 72 characters.
- **Do not end the summary with a period**.
- **Separate subject from body with a blank line**.
- **Explain WHAT and WHY, not HOW**: The diff shows how; explain the reason for the change.

### Good vs. Bad Examples

- ❌ `Bad`: `fixed bugs`
- ❌ `Bad`: `WIP on courses`
- ❌ `Bad`: `update README.md with typo`
- ✅ `Good`: `fix(api): handle null values in course author field`
- ✅ `Good`: `feat(web): add responsive mobile navigation drawer`
- ✅ `Good`: `docs(contributing): add guidelines for opening pull requests`

---

## 5. Mandatory Verification: Format & Lint Checks

**Before committing code**, you must run code formatters and linters to maintain codebase consistency and prevent CI failures.

### Step-by-Step Pre-Commit Verification

1. **Format Code (Prettier)**:

   ```bash
   pnpm format
   ```

   Ensures all code conforms to the shared `.prettierrc` configuration.

2. **Verify Formatting**:

   ```bash
   pnpm format:check
   ```

3. **Run Linter (ESLint)**:

   ```bash
   pnpm lint
   ```

   Fix any reported lint errors or warnings before committing.

4. **Run TypeScript Type Check**:

   ```bash
   pnpm typecheck
   ```

5. **Run the Complete Verification Pipeline**:
   ```bash
   pnpm verify
   ```
   This runs:
   ```text
   pnpm format:check && pnpm lint && pnpm typecheck && pnpm build
   ```

---

## 6. Staging and Committing

Once verification passes cleanly, stage and commit your changes:

```bash
# Stage your modified files
git add apps/api/src/routes/courses.ts

# Commit with a conventional commit message
git commit -m "feat(api): add filter by published status"
```

### Inspecting Your Commit

Verify your commit log before pushing:

```bash
git log -n 1 --stat
```
