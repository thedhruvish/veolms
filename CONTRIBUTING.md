# Contributing to VeoLMS

We welcome contributions to VeoLMS!

For comprehensive guidelines on contributing, please refer to our complete documentation in the [`docs/contribution/`](./docs/contribution/README.md) directory:

- 🚀 [**Getting Started with Forking & Setup**](./docs/contribution/getting-started.md)
- 📝 [**Git Commit Guidelines & Quality Checks**](./docs/contribution/commit-guidelines.md)
- 🔀 [**Creating Pull Requests**](./docs/contribution/pull-requests.md)
- ✍️ [**Spelling, Typos, and Minor Edits Policy**](./docs/contribution/spelling-and-typos.md)
- 🔒 [**Security Vulnerability Reporting**](./docs/contribution/security.md)

---

## Quick Summary

1. **Fork & Branch**: Fork the repo, clone locally, and create a feature branch off `upstream/development` (`feat/...` or `fix/...`). Never target or branch off `main`.
2. **Verify Code**: Always run `pnpm format`, `pnpm lint`, and `pnpm verify` before committing.
3. **Commit Messages**: Follow [Conventional Commits](https://www.conventionalcommits.org/) (e.g., `feat(api): add filter`).
4. **Pull Requests**: Open PRs against the `development` branch with clear descriptions and verification steps.
5. **Security Bugs**: Do **NOT** open public issues for security vulnerabilities. Email `security@veolms.org`.
