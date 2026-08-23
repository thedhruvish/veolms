# Frontend agent instructions

These instructions apply to every file and feature under `apps/web`. Agents must follow them for all new frontend work and for every frontend file they modify.

## Required architecture

- Organize code by feature or product module, not by file type alone.
- Keep React components, hooks, utilities, tests, and exceptional styles close to the feature that owns them.
- Build features from small, focused components with one clear responsibility.
- Split large React, TypeScript, and JavaScript files before they become difficult to understand, test, or review.
- Extract repeated UI patterns into reusable components. Do not copy the same markup or long Tailwind class lists across multiple screens.
- Keep feature-specific behavior inside the feature. Move code into shared modules only when it is genuinely reused by multiple features.
- Prefer explicit component APIs and typed variants over scattered conditional class strings.

## Tailwind-first styling

- Use Tailwind CSS utilities for all new styling whenever Tailwind can express the design.
- Do not add plain CSS for convenience, familiarity, or to avoid composing Tailwind utilities.
- Do not add new rules to global CSS files.
- Existing CSS is legacy code and may remain unchanged unless the task explicitly requires refactoring it. Do not perform unrelated CSS migrations while implementing a feature.
- When repeated Tailwind classes represent a reusable UI element, create a small reusable component or a typed class/variant helper. Do not solve repetition by moving ordinary component styling into plain CSS.

## Plain CSS exceptions

Plain CSS is allowed only when the required behavior cannot reasonably be implemented with Tailwind CSS, including Tailwind's responsive, state, arbitrary-value, and arbitrary-variant capabilities.

When an exception is necessary:

1. Create a feature-local CSS file owned by that module; never place the rule in a global stylesheet.
2. Import the file only from the feature or component entry point that needs it.
3. Keep selectors narrowly scoped and namespaced to the owning feature.
4. Add only the unsupported CSS behavior; keep all other styling in Tailwind.
5. Briefly document why Tailwind could not express the behavior so future agents do not expand the exception casually.

Typical exceptions may include complex keyframes, browser-specific pseudo-elements or APIs, and unavoidable third-party overrides. A shorter class name or a long utility list is not an exception.

## Maintainability requirements

- Preserve existing UI, behavior, accessibility, responsiveness, and performance unless the task explicitly changes them.
- Avoid monolithic components and catch-all feature files.
- Keep state and side effects as close as possible to the feature that owns them; extract focused hooks when logic becomes independently testable or reusable.
- Use semantic names based on product behavior, not visual accidents or temporary implementation details.
- Avoid hidden coupling between features, broad selectors, and imports that cause one module's styling or behavior to leak into another.
- Add or update focused tests for changed behavior. Run the relevant typecheck, lint, and tests before completing the work.

## Manual commit verification

- Do not add or configure a pre-commit hook for the browser memory regression tests.
- Before creating a commit that includes changes under `apps/web`, manually run the production-browser memory regression test suite in addition to the relevant typecheck, lint, and functional tests.
- Run memory checks against the production build and use the configured per-page baselines and budgets. Include ordinary pages without video and learning pages when they are affected by the change.
- If a memory check fails, do not proceed with the commit. Diagnose whether the failure is a product regression, a test problem, or an unstable measurement; fix the underlying issue and rerun the complete verification until it passes.
- If the memory suite is unavailable or cannot be run, report that clearly and do not claim that commit verification passed.

Before adding plain CSS or growing an already large file, stop and confirm that the change cannot be expressed as Tailwind utilities, a small feature component, a focused hook, or a reusable variant.
