# Styles architecture

The academy stylesheet is intentionally layered:

- `core.css` and `theme-contract.css` are the common foundation loaded by the
  app shell.
- `themes/<id>.css` contains only that palette's semantic tokens. The active
  palette is loaded as a single stylesheet by `themeStylesheet.ts`; the other
  palettes are not requested by the browser.
- `shell/` contains navigation and app-shell styles. The smaller files are
  imported in order by `shell/shell.css`.
- `features/` owns route or feature styles. A route component imports its
  feature entrypoint so Vite can keep that CSS in the route chunk.
- `global/surface-effects.css` contains cross-route surface behavior.

Keep new selectors close to the component or feature that owns them. Use
Tailwind utilities for one-off layout and spacing, and promote a repeated
utility composition into `src/ui` when it appears in more than one feature.
The compatibility entrypoints (`styles.css` and `shell-theme.css`) remain for
legacy imports, but new code should import the smallest relevant module.
