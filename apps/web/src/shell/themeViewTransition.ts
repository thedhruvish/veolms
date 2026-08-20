import "./theme-view-transition.css";

export function applyWithThemeViewTransition(commit: () => void): void {
  if (
    typeof document.startViewTransition !== "function" ||
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  ) {
    commit();
    return;
  }
  document.startViewTransition(commit);
}
