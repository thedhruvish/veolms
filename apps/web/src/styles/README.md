# Web CSS structure

`full-app.css` remains the single application stylesheet. It imports
`styles.css`, then `shell-theme.css`, then reading-mode CSS in the same
cascade order used before the modular split.

- `base/` contains global tokens, resets, and shared controls.
- `features/` contains page- and feature-owned rules.
- `shell/` contains navigation, shell controls, cards, and responsive shell rules.
- `themes/` contains theme declarations grouped by their original cascade stage.
- `global/` contains app-wide behavior that must remain late in the cascade.

All modules are intentionally imported globally for now. Do not move imports into
React components or reorder the entrypoints without visual-regression coverage;
the existing UI relies on the established cascade.
