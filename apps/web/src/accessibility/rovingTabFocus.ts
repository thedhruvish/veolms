import type { KeyboardEvent } from "react";

const TAB_SELECTOR = '[role="tab"]:not([disabled])';

/**
 * Applies the WAI-ARIA tablist keyboard model to an existing tab button.
 * Selection remains owned by each feature through its normal click handler.
 */
export function handleRovingTabKeyDown(
  event: KeyboardEvent<HTMLButtonElement>,
) {
  const { key } = event;
  if (
    key !== "ArrowLeft" &&
    key !== "ArrowRight" &&
    key !== "ArrowUp" &&
    key !== "ArrowDown" &&
    key !== "Home" &&
    key !== "End"
  )
    return;

  const tablist = event.currentTarget.closest<HTMLElement>('[role="tablist"]');
  if (!tablist) return;
  const tabs = [...tablist.querySelectorAll<HTMLButtonElement>(TAB_SELECTOR)];
  const currentIndex = tabs.indexOf(event.currentTarget);
  if (currentIndex < 0 || tabs.length === 0) return;

  event.preventDefault();
  const nextIndex =
    key === "Home"
      ? 0
      : key === "End"
        ? tabs.length - 1
        : (currentIndex +
            (key === "ArrowRight" || key === "ArrowDown" ? 1 : -1) +
            tabs.length) %
          tabs.length;
  const nextTab = tabs[nextIndex];
  nextTab?.focus({ preventScroll: true });
  nextTab?.click();
}
