import { useEffect } from "react";
import { academyThemes } from "../themes.ts";

const AUTH_PALETTE = "midnight";
const AUTH_THEME = "dark";

function readStoredValue(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function readFlag(key: string): boolean {
  return readStoredValue(key) === "true";
}

// The auth screens carry no appearance control, so `?theme=` is the only way to
// see them under another palette while working on them. `import.meta.env.DEV` is
// folded to `false` at build time, which drops this branch from the bundle.
function readPreviewPalette(): string | null {
  if (import.meta.env.DEV) {
    try {
      const requested = new URLSearchParams(window.location.search).get(
        "theme",
      );
      if (
        requested !== null &&
        academyThemes.some((theme) => theme.id === requested)
      ) {
        return requested;
      }
    } catch {
      return null;
    }
  }

  return null;
}

// Nobody is signed in yet, so there is no preference to honour, and the brand
// panel ships a raster illustration drawn for the midnight ground. The auth
// screens pin both palette and mode, then hand back whatever they replaced.
export function useAuthAppearance() {
  useEffect(() => {
    const root = document.documentElement;
    const previousPalette = root.dataset.palette;
    const previousTheme = root.dataset.theme;

    root.dataset.palette = readPreviewPalette() ?? AUTH_PALETTE;
    root.dataset.theme = AUTH_THEME;
    root.dataset.reduceAnimations = String(
      readFlag("veolms-reduce-animations"),
    );
    root.dataset.highContrast = String(readFlag("veolms-high-contrast"));

    return () => {
      if (previousPalette === undefined) delete root.dataset.palette;
      else root.dataset.palette = previousPalette;

      if (previousTheme === undefined) delete root.dataset.theme;
      else root.dataset.theme = previousTheme;
    };
  }, []);
}
