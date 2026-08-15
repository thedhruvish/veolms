import { useEffect } from "react";
import { DEFAULT_ACADEMY_THEME, getInitialAcademyTheme } from "../themes";

type ThemePreference = "light" | "dark" | "device";

function readStoredValue(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function readThemePreference(): ThemePreference {
  const stored = readStoredValue("veolms-theme");
  return stored === "light" || stored === "device" ? stored : "dark";
}

function readFlag(key: string): boolean {
  return readStoredValue(key) === "true";
}

function readPalette(): string {
  try {
    return getInitialAcademyTheme();
  } catch {
    return DEFAULT_ACADEMY_THEME;
  }
}

// The academy shell restores these preferences on its own mount, and the auth
// screens render outside it, so they would otherwise be stuck on the defaults.
export function useAuthAppearance() {
  useEffect(() => {
    const root = document.documentElement;
    root.dataset.palette = readPalette();
    root.dataset.reduceAnimations = String(
      readFlag("veolms-reduce-animations"),
    );
    root.dataset.highContrast = String(readFlag("veolms-high-contrast"));

    const preference = readThemePreference();
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const applyTheme = () => {
      root.dataset.theme =
        preference === "device"
          ? media.matches
            ? "dark"
            : "light"
          : preference;
    };

    applyTheme();
    if (preference !== "device") return undefined;
    media.addEventListener("change", applyTheme);
    return () => media.removeEventListener("change", applyTheme);
  }, []);
}
