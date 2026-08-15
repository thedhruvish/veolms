# Creating and Managing Pull Requests

This guide covers the process for opening, iterating on, and landing Pull Requests (PRs) in VeoLMS.

---

## 1. Before Submitting a PR

> [!IMPORTANT]
> **Branch Rule: All PRs must target the `development` branch.**
> Do not open PRs against `main`. The `main` branch is reserved for stable production releases only.

Before opening a pull request, ensure:

1. **Your branch is based on latest upstream `development`**:
   ```bash
   git fetch upstream
   git rebase upstream/development
   ```
2. **All automated checks pass locally**:
   ```bash
   pnpm verify
   ```
3. **Commit history is clean and follows Conventional Commits** (see [Commit Guidelines](./commit-guidelines.md)).
4. **Scope is focused**: Each PR should address a single feature, bug fix, or documentation enhancement. Avoid bundling unrelated changes.

---

## 2. Pushing Your Changes

Push your local feature branch to your GitHub fork:

```bash
git push -u origin feat/your-feature-name
```

---

## 3. Opening the Pull Request

1. Go to the [VeoLMS upstream repository](https://github.com/veolms/veolms).
2. You should see a banner suggesting to create a pull request from your recently pushed branch. Click **Compare & pull request**.
3. **Ensure the base repository is `veolms/veolms` and base branch is `development`** (do NOT select `main`).
4. Ensure the head repository is your fork `<username>/veolms` and compare branch is your feature branch.

---

## 4. PR Title and Description Format

### PR Title

Follow Conventional Commits for the PR title:

- `feat(api): add pagination support to courses endpoint`
- `fix(web): resolve layout shift on mobile navbar`
- `docs(readme): add contributing guide link`

### PR Description Template

Use a clear, informative description structure:

```markdown
## Summary

A concise explanation of what this PR does and why it is needed.

## Changes Made

- Added `page` and `limit` query parameters in courses route.
- Updated Kysely query builder to apply offset pagination.
- Added contract types in `packages/contracts`.

## Related Issues

Closes #123

## Verification / Testing

- [x] Ran `pnpm verify` locally with no errors.
- [x] Tested endpoint manually at `http://localhost:4000/api/courses?page=1&limit=10`.
- [x] Added automated tests in `apps/api/tests`.

## Screenshots (if UI change)

<!-- Attach before/after screenshots if modifying frontend components -->
```

---

## 5. The Review Process

1. **Automated CI**: Automated GitHub Actions workflows will run format, lint, typecheck, and build tests on your PR.
2. **Maintainer Review**: Maintainers will review code clarity, architecture boundaries, type safety, and testing.
3. **Addressing Feedback**:
   - If changes are requested, make the edits on your local branch.
   - Run `pnpm verify` again.
   - Commit the changes and push to your fork branch:
     ```bash
     git add .
     git commit -m "fix(api): address review comments on parameter bounds"
     git push origin feat/your-feature-name
     ```
   - The PR will automatically update with new commits.

---

## 6. Keeping Your Branch Up-to-Date

If changes have merged into upstream `development` while your PR is in review:

```bash
git checkout feat/your-feature-name
git fetch upstream
git rebase upstream/development
git push --force-with-lease origin feat/your-feature-name
```

---

## 7. PR Checklist

- [ ] Branch is based on and synced with upstream `development`.
- [ ] PR targets the `development` branch as base (not `main`).
- [ ] Code passes `pnpm verify` (`format:check`, `lint`, `typecheck`, `build`).
- [ ] Commit messages follow [Conventional Commits](./commit-guidelines.md).
- [ ] PR description clearly explains motivation, changes, and testing steps.
- [ ] No extraneous files or sensitive credentials (`.env`, build artifacts) are committed.
