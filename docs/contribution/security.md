# Security Vulnerability Reporting Policy

We take the security of VeoLMS seriously. If you discover or suspect a security vulnerability, please read and follow this policy carefully.

---

## 1. ⚠️ DO NOT Open Public Issues for Security Vulnerabilities

> [!CAUTION]
> **Never open a public GitHub issue, public pull request, or public discussion** for security vulnerabilities, exploits, or sensitive bugs. Public disclosures put users and running instances at risk before a patch can be developed and released.

---

## 2. Reporting via Email

Please report all security vulnerabilities directly to the maintainers via private email:

- **Security Contact Email**: `security@veolms.org` 
- **Email Subject**: `[SECURITY VULNERABILITY] <Brief description of the issue>`

---

## 3. What to Include in Your Report

To help us triage and resolve the issue quickly, please include:

1. **Vulnerability Summary**: A concise overview of the vulnerability and its potential impact.
2. **Affected Components**: Specific packages, routes, or files affected (e.g., `apps/api/src/modules/auth`, `packages/database`).
3. **Step-by-Step Reproduction**: Detailed steps, requests, or scripts demonstrating how to reproduce the issue.
4. **Proof of Concept (PoC)**: Minimal reproduction code or payloads (if applicable).
5. **Impact Assessment**: What an attacker could achieve (e.g., unauthorized data access, privilege escalation, denial of service).
6. **Suggested Remediation**: If you have identified a potential fix, feel free to suggest it in the email.

---

## 4. Responsible Disclosure Timeline

1. **Acknowledgment**: We aim to acknowledge receipt of vulnerability reports within 48 hours.
2. **Triage & Validation**: Maintainers will review and confirm the vulnerability in an isolated private environment.
3. **Patch Development**: We will develop and test a security patch in a private repository.
4. **Coordinated Release**: A patched release will be published along with a security advisory detailing the fix and giving credit to the reporter (unless you prefer to remain anonymous).

Thank you for practicing responsible disclosure and helping keep VeoLMS and its users safe!
