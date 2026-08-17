import { useEffect, useRef, useState } from "react";
import type { CSSProperties, KeyboardEvent as ReactKeyboardEvent } from "react";
import type { AcademyTheme } from "../themes";

interface AcademyPaletteMenuProps {
  themes: readonly Pick<AcademyTheme, "id" | "name" | "note" | "preview">[];
  selectedTheme: string;
  className?: string;
  id?: string;
  mobile?: boolean;
  onSelect: (themeId: string) => void;
  onPreview: (themeId: string) => void;
  onConfirm: (themeId: string) => void;
  onCancel: () => void;
}

const PALETTE_GRID_COLUMNS = 4;

export function AcademyPaletteMenu({
  themes,
  selectedTheme,
  className = "sidebar-palette-menu",
  id,
  mobile = false,
  onSelect,
  onPreview,
  onConfirm,
  onCancel,
}: AcademyPaletteMenuProps) {
  const [activeTheme, setActiveTheme] = useState(selectedTheme);
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);

  useEffect(() => {
    if (themes.some((theme) => theme.id === selectedTheme)) {
      setActiveTheme(selectedTheme);
    }
  }, [selectedTheme, themes]);

  useEffect(() => {
    const selectedIndex = themes.findIndex(
      (theme) => theme.id === selectedTheme,
    );
    itemRefs.current[Math.max(0, selectedIndex)]?.focus({
      preventScroll: true,
    });
  }, [selectedTheme, themes]);

  const previewThemeAt = (index: number) => {
    const nextTheme = themes[index];
    if (!nextTheme) return;
    setActiveTheme(nextTheme.id);
    onPreview(nextTheme.id);
    itemRefs.current[index]?.focus({ preventScroll: true });
  };

  const getDirectionalThemeIndex = (
    activeIndex: number,
    key: "ArrowDown" | "ArrowLeft" | "ArrowRight" | "ArrowUp",
  ) => {
    if (themes.length === 0) return activeIndex;
    const rowCount = Math.ceil(themes.length / PALETTE_GRID_COLUMNS);
    const row = Math.floor(activeIndex / PALETTE_GRID_COLUMNS);
    const column = activeIndex % PALETTE_GRID_COLUMNS;

    if (key === "ArrowLeft" || key === "ArrowRight") {
      const nextColumn =
        (column + (key === "ArrowRight" ? 1 : -1) + PALETTE_GRID_COLUMNS) %
        PALETTE_GRID_COLUMNS;
      const nextIndex = row * PALETTE_GRID_COLUMNS + nextColumn;
      return nextIndex < themes.length ? nextIndex : activeIndex;
    }

    const nextRow =
      (row + (key === "ArrowDown" ? 1 : -1) + rowCount) % rowCount;
    const nextIndex = nextRow * PALETTE_GRID_COLUMNS + column;
    return nextIndex < themes.length ? nextIndex : activeIndex;
  };

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const activeIndex = Math.max(
      0,
      themes.findIndex((theme) => theme.id === activeTheme),
    );

    if (
      event.key === "ArrowDown" ||
      event.key === "ArrowUp" ||
      event.key === "ArrowRight" ||
      event.key === "ArrowLeft"
    ) {
      event.preventDefault();
      previewThemeAt(getDirectionalThemeIndex(activeIndex, event.key));
      return;
    }

    if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      previewThemeAt(event.key === "Home" ? 0 : themes.length - 1);
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      event.stopPropagation();
      onConfirm(activeTheme);
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      onCancel();
    }
  };

  return (
    <div
      data-palette-menu
      data-mobile-palette-menu={mobile || undefined}
      id={id}
      className={className}
      role="menu"
      aria-label="Choose a color theme"
      aria-keyshortcuts="ArrowUp ArrowDown ArrowLeft ArrowRight Home End Enter Escape"
      onKeyDown={handleKeyDown}
    >
      {themes.map((item, index) => (
        <button
          ref={(element) => {
            itemRefs.current[index] = element;
          }}
          type="button"
          role="menuitemradio"
          aria-label={`${item.name}. ${item.note}`}
          aria-checked={item.id === activeTheme}
          tabIndex={item.id === activeTheme ? 0 : -1}
          className={item.id === activeTheme ? "is-selected" : ""}
          key={item.id}
          title={`${item.name} — ${item.note}`}
          data-theme-swatch={item.id}
          style={{ "--theme-swatch": item.preview } as CSSProperties}
          onClick={() => {
            setActiveTheme(item.id);
            onSelect(item.id);
          }}
        >
          <i aria-hidden="true" />
        </button>
      ))}
    </div>
  );
}
