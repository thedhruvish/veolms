import { Check } from "@phosphor-icons/react";
import type { AcademyTheme } from "../themes";

interface AcademyPaletteMenuProps {
  themes: readonly Pick<AcademyTheme, "id" | "name" | "note" | "preview">[];
  selectedTheme: string;
  className?: string;
  id?: string;
  mobile?: boolean;
  onSelect: (themeId: string) => void;
}

export function AcademyPaletteMenu({
  themes,
  selectedTheme,
  className = "sidebar-palette-menu",
  id,
  mobile = false,
  onSelect,
}: AcademyPaletteMenuProps) {
  return (
    <div
      data-mobile-palette-menu={mobile || undefined}
      id={id}
      className={className}
      role="menu"
      aria-label="Choose a color theme"
    >
      <div>
        <strong>Color theme</strong>
        <span>Independent from light and dark mode</span>
      </div>
      {themes.map((item) => (
        <button
          type="button"
          role="menuitemradio"
          aria-checked={item.id === selectedTheme}
          className={item.id === selectedTheme ? "is-selected" : ""}
          key={item.id}
          onClick={() => onSelect(item.id)}
        >
          <i style={{ background: item.preview }} />
          <span>
            <strong>{item.name}</strong>
            <small>{item.note}</small>
          </span>
          {item.id === selectedTheme && <Check size={16} weight="bold" />}
        </button>
      ))}
    </div>
  );
}
