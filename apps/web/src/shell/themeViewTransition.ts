import "./theme-view-transition.css";

export type ThemeViewTransitionKind = "mode" | "palette";

export function applyWithThemeViewTransition(
  commit: () => void,
  kind: ThemeViewTransitionKind = "mode",
): void {
  if (
    typeof document.startViewTransition !== "function" ||
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  ) {
    commit();
    return;
  }
  // Tag the root so the mask can pick its reveal corner; keep the tag until
  // the transition settles so the pseudo-element styles stay stable.
  document.documentElement.dataset.themeTransition = kind;
  const transition = document.startViewTransition(commit);
  const clear = () => {
    // A newer transition may have retagged the root already; only clear ours.
    if (document.documentElement.dataset.themeTransition === kind) {
      delete document.documentElement.dataset.themeTransition;
    }
  };
  transition.finished.then(clear, clear);
}
