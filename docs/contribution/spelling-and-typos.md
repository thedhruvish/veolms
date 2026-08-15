# Guidelines for Typos, Spelling Mistakes, and Minor Edits

To maintain project quality and respect maintainer review bandwidth, VeoLMS has specific guidelines regarding spelling fixes, typo corrections, and minor text edits.

---

## 1. What NOT to Do (Anti-Patterns)

Please do **NOT**:

- ❌ **Do not open individual PRs for single-word typos**: Opening multiple micro-PRs for individual minor typos in comments or markdown files creates excessive notifications and review overhead.
- ❌ **Do not open PRs that only reformat whitespace or punctuation**: Unless modifying functionality or resolving linter errors.
- ❌ **Do not blindly run automated spellcheckers across the codebase**: This often breaks technical jargon, identifier names, URL fragments, or package names.
- ❌ **Do not submit PRs solely for GitHub contribution farming**: PRs must provide genuine, meaningful value to the project.

---

## 2. Recommended Approach: Batching Minor Corrections

If you discover typos, grammatical errors, or outdated explanations in the documentation or codebase:

1. **Review the entire document or module**: Check the full file or related section for other improvements, outdated links, or formatting issues.
2. **Bundle related fixes together**: Group multiple typo and grammatical corrections across a module or documentation section into a single, coherent pull request.
3. **Use a clear commit message**:
   ```text
   docs(readme): correct spelling mistakes and clarify setup commands
   ```
4. **Detail your changes in the PR description**: List which sections were adjusted and why.

---

## 3. Preservation of Technical Terms and Code Symbols

When updating documentation or comments:

- **Do not alter code symbols or parameters**: Ensure variable names, function names, and types referenced in prose match the code exactly (e.g., `FastifyInstance`, `Kysely<Database>`).
- **Maintain Markdown links**: Ensure relative links (e.g., `[architecture](docs/architecture.md)`) and code block tags remain intact.
- **Verify formatting**: Run `pnpm format:check` and `pnpm lint` after editing docs.
