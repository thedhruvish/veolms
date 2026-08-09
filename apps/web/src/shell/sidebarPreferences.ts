import type { SidebarPreferences } from "../settings/settingsPreferences";

export const SIDEBAR_MIN_WIDTH = 220;
const SIDEBAR_MAX_WIDTH = 300;
const SIDEBAR_MAX_WIDTH_LIMIT = 520;
const SIDEBAR_DEFAULT_WIDTH = 300;
const SIDEBAR_MAX_WIDTH_DEFAULT_VERSION = "300px-v1";

export const clampSidebarMaxWidth = (value: unknown): number => {
  const numericValue = Number(value);
  return Number.isFinite(numericValue)
    ? Math.min(
        SIDEBAR_MAX_WIDTH_LIMIT,
        Math.max(SIDEBAR_MIN_WIDTH, numericValue),
      )
    : SIDEBAR_MAX_WIDTH;
};

export const clampSidebarWidth = (
  value: number | string,
  maxWidth: unknown = SIDEBAR_MAX_WIDTH,
): number =>
  Math.min(
    clampSidebarMaxWidth(maxWidth),
    Math.max(SIDEBAR_MIN_WIDTH, Number(value)),
  );

export const getInitialSidebarWidth = (): number => {
  const savedWidth = Number(localStorage.getItem("veolms-sidebar-width"));
  return Number.isFinite(savedWidth)
    ? clampSidebarWidth(savedWidth)
    : SIDEBAR_DEFAULT_WIDTH;
};

export const getInitialSidebarPreferences = (): SidebarPreferences => {
  const fallback: SidebarPreferences = {
    iconStyle: "multicolor",
    monochromeMode: "theme",
    monochromeColor: "#6c78ff",
    contentLayout: "framed",
    sidebarMaxWidth: SIDEBAR_MAX_WIDTH,
    showCollapsedLabels: true,
    showCollapsedLogo: true,
    highlightActive: true,
  };
  try {
    const saved: unknown = JSON.parse(
      localStorage.getItem("veolms-sidebar-preferences") || "{}",
    );
    const preferences = {
      ...fallback,
      ...(saved && typeof saved === "object" ? saved : {}),
    } as SidebarPreferences;
    const hasCurrentMaxWidthDefault =
      localStorage.getItem("veolms-sidebar-max-width-default-version") ===
      SIDEBAR_MAX_WIDTH_DEFAULT_VERSION;

    if (!hasCurrentMaxWidthDefault) {
      preferences.sidebarMaxWidth = SIDEBAR_MAX_WIDTH;
      localStorage.setItem(
        "veolms-sidebar-max-width-default-version",
        SIDEBAR_MAX_WIDTH_DEFAULT_VERSION,
      );
    }

    return preferences;
  } catch {
    return fallback;
  }
};
