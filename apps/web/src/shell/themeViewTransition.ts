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

let lastPointerOrigin: { x: number; y: number; timestamp: number } | null =
  null;

// Overlapping transitions of the same kind share the tag value and can even
// stage identical reveal coordinates, so value comparisons can never prove
// which transition owns the root tag or the staged origin. Each transition
// instead claims a unique id; cleanup only clears what that id still owns.
let nextTransitionId = 0;
let taggedTransitionId: number | null = null;
let stagedOriginTransitionId: number | null = null;

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
// ::view-transition-new(root) mask inherits them. Returns without staging
// (and without claiming origin ownership) when no fresh pointer origin
// exists; the mask's keyword fallbacks (corner origins) then apply for
// keyboard and OS-triggered changes.
function stageRevealOrigin(transitionId: number): void {
  const origin = lastPointerOrigin;
  if (!origin) return;
  if (performance.now() - origin.timestamp > POINTER_ORIGIN_MAX_AGE_MS) {
    return;
  }
  // The duration stays fixed: shortening it for center-ish clicks is what
  // made the reveal feel rushed there, while corner clicks felt smooth.
  const style = document.documentElement.style;
  style.setProperty("--theme-reveal-x", `${origin.x}px`);
  style.setProperty("--theme-reveal-y", `${origin.y}px`);
  stagedOriginTransitionId = transitionId;
}

function clearStagedRevealOrigin(transitionId: number): void {
  // A newer transition may have restaged its own origin already; only remove
  // the properties while this transition still owns them.
  if (stagedOriginTransitionId !== transitionId) return;
  const style = document.documentElement.style;
  for (const property of revealOriginProperties) {
    style.removeProperty(property);
  }
  stagedOriginTransitionId = null;
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
  const transitionId = nextTransitionId++;
  document.documentElement.dataset.themeTransition = kind;
  taggedTransitionId = transitionId;
  stageRevealOrigin(transitionId);
  const transition = document.startViewTransition(commit);
  const clear = () => {
    // A newer transition may have retagged the root or restaged the origin;
    // only clear what this transition still owns, by identity rather than by
    // value (same-kind overlaps can carry identical values).
    if (taggedTransitionId === transitionId) {
      delete document.documentElement.dataset.themeTransition;
      taggedTransitionId = null;
    }
    clearStagedRevealOrigin(transitionId);
  };
  transition.finished.then(clear, clear);
}
