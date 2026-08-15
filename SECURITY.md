# Security Policy

We take the security of VeoLMS seriously. If you discover a vulnerability, please report it responsibly by following this policy.

---

## Supported Versions

Only the latest `development` branch and published releases receive active security updates.

| Version / Branch | Supported          |
| :--------------- | :----------------- |
| `development`    | :white_check_mark: |
| Older releases   | :x:                |

---

## Reporting a Vulnerability

> [!CAUTION]
> **DO NOT report security vulnerabilities through public GitHub issues, discussions, or pull requests.**

### How to Report Privately

1. **Email us**: Send full details of the vulnerability to `security@veolms.org`.
2. **Subject line**: `[SECURITY VULNERABILITY] <Brief description>`
3. **Include**:
   - Detailed description of the vulnerability.
   - Affected packages or endpoints (e.g. `apps/api`, `packages/database`).
   - Step-by-step reproduction steps or minimal Proof of Concept (PoC).
   - Impact assessment (e.g. unauthorized data access, privilege escalation).
   - Any suggested remediation if available.

---

## Response Process

1. **Acknowledgment**: We will acknowledge your report within 48 hours.
2. **Investigation**: Maintainers will investigate and validate the vulnerability in a private security advisory branch.
3. **Fix & Release**: We will prepare and deploy a patch, followed by a coordinated public security advisory giving credit to the reporter (unless anonymity is requested).

For full details, please refer to our [Security Policy Guide](./docs/contribution/security.md).
