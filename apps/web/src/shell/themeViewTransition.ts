import "./theme-view-transition.css";

export type ThemeViewTransitionKind = "mode" | "palette";

// Pointerdown is the earliest signal of the interaction that will trigger the
// reveal, so one document-level listener can feed every trigger (dock toggle,
// palette menu, long-press, swipe) without threading click events through
// React state and effects.
const POINTER_ORIGIN_MAX_AGE_MS = 2_000;

const revealOriginProperties = [
  "--theme-reveal-x",
  "--theme-reveal-y",
] as const;

type RevealOriginProperty = (typeof revealOriginProperties)[number];
type StagedRevealOrigin = Record<RevealOriginProperty, string> | null;

let lastPointerOrigin: { x: number; y: number; timestamp: number } | null =
  null;

if (typeof document !== "undefined") {
  document.addEventListener(
    "pointerdown",
    (event) => {
      lastPointerOrigin = {
        x: event.clientX,
        y: event.clientY,
        timestamp: performance.now(),
      };
    },
    { capture: true, passive: true },
  );
}

// Stages the reveal origin as inline custom properties on the root so the
// ::view-transition-new(root) mask inherits them. Returns null (and stages
// nothing) when no fresh pointer origin exists; the mask's keyword fallbacks
// (corner origins) then apply for keyboard and OS-triggered changes.
function stageRevealOrigin(): StagedRevealOrigin {
  const origin = lastPointerOrigin;
  if (!origin) return null;
  if (performance.now() - origin.timestamp > POINTER_ORIGIN_MAX_AGE_MS) {
    return null;
  }
  // The duration stays fixed: shortening it for center-ish clicks is what
  // made the reveal feel rushed there, while corner clicks felt smooth.
  const staged = {
    "--theme-reveal-x": `${origin.x}px`,
    "--theme-reveal-y": `${origin.y}px`,
  };
  const style = document.documentElement.style;
  for (const property of revealOriginProperties) {
    style.setProperty(property, staged[property]);
  }
  return staged;
}

function clearStagedRevealOrigin(staged: StagedRevealOrigin): void {
  if (!staged) return;
  const style = document.documentElement.style;
  // A newer transition may have restaged its own origin already; only remove
  // our values while the inline style still holds the ones we set.
  if (
    style.getPropertyValue("--theme-reveal-x") !== staged["--theme-reveal-x"]
  ) {
    return;
  }
  for (const property of revealOriginProperties) {
    style.removeProperty(property);
  }
}

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
  const stagedRevealOrigin = stageRevealOrigin();
  const transition = document.startViewTransition(commit);
  const clear = () => {
    // A newer transition may have retagged the root already; only clear ours.
    if (document.documentElement.dataset.themeTransition === kind) {
      delete document.documentElement.dataset.themeTransition;
    }
    clearStagedRevealOrigin(stagedRevealOrigin);
  };
  transition.finished.then(clear, clear);
}
