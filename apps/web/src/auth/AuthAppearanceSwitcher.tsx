import { useEffect, useRef, useState } from "react";
import { Icon } from "../icons/Icon";
import { setIconPack, useIconPack } from "../icons/iconPack";
import { AcademyPaletteMenu } from "../shell/AcademyPaletteMenu";
import {
  academyThemes,
  getInitialAcademyTheme,
  persistAcademyTheme,
} from "../themes";

const MENU_ID = "auth-palette-menu";
const THEME_KEY = "veolms-theme";
const PACK_LABELS = { lucide: "Lucide", phosphor: "Phosphor" } as const;

type AppearanceMode = "light" | "dark";

function readInitialMode(): AppearanceMode {
  const stored = window.localStorage.getItem(THEME_KEY);
  if (stored === "light" || stored === "dark") return stored;
  if (stored === "device") {
    return window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
  }
  return "dark";
}

export function AuthAppearanceSwitcher() {
  const [mode, setMode] = useState(readInitialMode);
  const iconPack = useIconPack();
  const nextPack = iconPack === "lucide" ? "phosphor" : "lucide";
  const [palette, setPalette] = useState(getInitialAcademyTheme);
  const [previewPalette, setPreviewPalette] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const displayedPalette = previewPalette ?? palette;

  useEffect(() => {
    document.documentElement.dataset.palette = displayedPalette;
  }, [displayedPalette]);

  useEffect(() => {
    if (!menuOpen) return undefined;

    const dismiss = (event: PointerEvent) => {
      if (
        event.target instanceof Element &&
        event.target.closest("[data-palette-menu], [data-palette-trigger]")
      ) {
        return;
      }
      setPreviewPalette(null);
      setMenuOpen(false);
    };

    document.addEventListener("pointerdown", dismiss);
    return () => document.removeEventListener("pointerdown", dismiss);
  }, [menuOpen]);

  // Focusing before the state commit lands means the menu is still mounted, so
  // the browser never bounces focus to the body on its way out.
  const closeMenu = () => {
    triggerRef.current?.focus({ preventScroll: true });
    setPreviewPalette(null);
    setMenuOpen(false);
  };

  const choosePalette = (themeId: string) => {
    setPalette(themeId);
    setPreviewPalette(null);
    persistAcademyTheme(themeId);
  };

  const confirmPalette = (themeId: string) => {
    choosePalette(themeId);
    closeMenu();
  };

  const toggleMode = () => {
    const next: AppearanceMode = mode === "dark" ? "light" : "dark";
    setMode(next);
    document.documentElement.dataset.theme = next;
    window.localStorage.setItem(THEME_KEY, next);
  };

  return (
    <div className="auth-appearance">
      <div className="auth-appearance__palette">
        <button
          ref={triggerRef}
          data-palette-trigger
          aria-controls={MENU_ID}
          aria-expanded={menuOpen}
          aria-label="Choose color theme"
          className="auth-appearance__button"
          onClick={() => (menuOpen ? closeMenu() : setMenuOpen(true))}
          type="button"
        >
          <Icon name="palette" size={18} />
        </button>
        {menuOpen && (
          <AcademyPaletteMenu
            themes={academyThemes}
            selectedTheme={displayedPalette}
            className="sidebar-palette-menu auth-appearance__menu"
            id={MENU_ID}
            onSelect={choosePalette}
            onPreview={setPreviewPalette}
            onConfirm={confirmPalette}
            onCancel={closeMenu}
          />
        )}
      </div>
      <button
        aria-label={`Switch to ${mode === "dark" ? "light" : "dark"} mode`}
        className="auth-appearance__button"
        onClick={toggleMode}
        type="button"
      >
        <Icon name={mode === "dark" ? "darkMode" : "lightMode"} size={18} />
      </button>
      <button
        aria-label={`Switch to ${PACK_LABELS[nextPack]} icons`}
        className="auth-appearance__button"
        onClick={() => setIconPack(nextPack)}
        type="button"
      >
        <Icon name="iconPack" size={18} />
      </button>
    </div>
  );
}
