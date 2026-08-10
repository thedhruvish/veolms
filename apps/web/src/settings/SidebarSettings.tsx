import {
  Check,
  CircleHalf,
  Info,
  Palette,
  Plus,
  SidebarSimple,
  TextT,
} from "@phosphor-icons/react";
import { academyThemes } from "../themes";
import type { AcademyTheme } from "../themes";
import {
  ChoiceCard,
  RadioGroup,
  SettingRow,
  SettingsToggle,
} from "./SettingsControls";
import { MiniSurface, SidebarIconPreview } from "./SettingsPreviews";
import {
  normalizeSidebarMaxWidth,
  SIDEBAR_MAX_WIDTH_LIMIT,
  SIDEBAR_MAX_WIDTH_MIN,
} from "./settingsPreferences";
import type { SidebarMode, SidebarPreferences } from "./settingsPreferences";

// Keep Settings in lockstep with the sidebar and mobile palette menus. This is
// deliberately the shared registry rather than a display-only subset.
const COLOR_THEMES = academyThemes;

interface SidebarIconColor {
  id: string;
  label: string;
  color: string;
}

const SIDEBAR_ICON_COLORS: readonly SidebarIconColor[] = [
  { id: "indigo", label: "Indigo", color: "#6366f1" },
  { id: "blue", label: "Blue", color: "#1683e3" },
  { id: "green", label: "Green", color: "#2fb665" },
  { id: "red", label: "Red", color: "#cc3364" },
  { id: "orange", label: "Orange", color: "#ed8c00" },
  { id: "cyan", label: "Cyan", color: "#1bb4c7" },
];

export interface SidebarSettingsProps {
  sidebarPreferences?: SidebarPreferences;
  onSidebarPreferencesChange?: (preferences: SidebarPreferences) => void;
  academyTheme: AcademyTheme["id"];
  sidebarMode: SidebarMode;
  onSidebarModeChange?: (mode: SidebarMode) => void;
}

export function SidebarSettings({
  sidebarPreferences,
  onSidebarPreferencesChange,
  academyTheme,
  sidebarMode,
  onSidebarModeChange,
}: SidebarSettingsProps) {
  const preferences = sidebarPreferences || {};
  const iconStyle = preferences.iconStyle || "monochrome";
  const colorMode = preferences.monochromeMode || "theme";
  const customColor = preferences.monochromeColor || "#6366f1";
  const themeColor =
    COLOR_THEMES.find((item) => item.id === academyTheme)?.preview || "#6366f1";
  const displayColor =
    colorMode === "theme"
      ? themeColor
      : colorMode === "neutral"
        ? "#9eacc0"
        : customColor;
  const layout = preferences.contentLayout || "framed";
  const sidebarMaxWidth = normalizeSidebarMaxWidth(preferences.sidebarMaxWidth);
  const showLabels = preferences.showCollapsedLabels !== false;
  const showCollapsedLogo = preferences.showCollapsedLogo !== false;
  const showThemeIcon = preferences.showThemeIcon !== false;
  const highlightActive = preferences.highlightActive !== false;
  const sidebarHidden = sidebarMode === "hidden";
  const selectedPreset =
    SIDEBAR_ICON_COLORS.find(
      (item) => item.color.toLowerCase() === displayColor.toLowerCase(),
    )?.id || (colorMode === "theme" ? "indigo" : "custom");
  const update = (next: SidebarPreferences) =>
    onSidebarPreferencesChange?.({ ...preferences, ...next });

  return (
    <div className="settings-content">
      <section className="settings-section">
        <div className="settings-section__heading-row">
          <div>
            <h2>Icon style</h2>
            <p>Choose how icons are displayed in the sidebar.</p>
          </div>
        </div>
        <RadioGroup className="settings-choice-grid settings-choice-grid--two settings-choice-grid--sidebar-style-options">
          <ChoiceCard
            checked={iconStyle === "multicolor"}
            onChange={() => update({ iconStyle: "multicolor" })}
            label="Multicolor"
            note="Each icon is displayed with its own color"
            className="settings-choice-card--horizontal settings-choice-card--sidebar-style"
            preview={<SidebarIconPreview />}
          />
          <ChoiceCard
            checked={iconStyle === "monochrome"}
            onChange={() => update({ iconStyle: "monochrome" })}
            label="Monochrome"
            note="All icons use a single color"
            className="settings-choice-card--horizontal settings-choice-card--sidebar-style"
            preview={<SidebarIconPreview monochrome monoColor={themeColor} />}
          />
        </RadioGroup>
      </section>

      <section className="settings-section">
        <div className="settings-section__heading-row">
          <div>
            <h2>Icon color</h2>
            <p>
              Choose the color used for sidebar icons when Monochrome style is
              selected.
            </p>
          </div>
          <span className="settings-section__hint">
            <Info size={16} weight="bold" /> This setting won&apos;t affect
            Multicolor style
          </span>
        </div>
        <RadioGroup className="settings-icon-color-options">
          {(
            [
              ["theme", "Follow color theme"],
              ["neutral", "Adaptive neutral"],
              ["custom", "Custom"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={colorMode === id}
              tabIndex={colorMode === id ? 0 : -1}
              className={`settings-icon-color-option ${colorMode === id ? "is-selected" : ""}`}
              onClick={() => update({ monochromeMode: id })}
            >
              <span className="settings-radio" aria-hidden="true">
                {colorMode === id && <Check size={11} weight="bold" />}
              </span>
              <span>
                <strong>{label}</strong>
                <small>
                  {id === "theme"
                    ? "Icons match the current theme color"
                    : id === "neutral"
                      ? "Icons adapt to light or dark mode"
                      : "Choose any color you prefer"}
                </small>
              </span>
            </button>
          ))}
        </RadioGroup>
        <div className="settings-color-tools settings-color-tools--redesign">
          <div className="settings-color-tools__quick">
            <span className="settings-color-tools__label">Quick colors</span>
            <div
              className="settings-preset-list"
              aria-label="Monochrome color presets"
            >
              {SIDEBAR_ICON_COLORS.map((item) => (
                <button
                  type="button"
                  key={item.id}
                  className={`settings-color-swatch ${selectedPreset === item.id ? "is-selected" : ""}`}
                  aria-label={`${item.label} icon color`}
                  onClick={() =>
                    update({
                      monochromeMode: "custom",
                      monochromeColor: item.color,
                    })
                  }
                >
                  <i style={{ background: item.color }} />
                </button>
              ))}
              <span
                className="settings-color-swatch-divider"
                aria-hidden="true"
              />
              <button
                type="button"
                className={`settings-color-swatch settings-color-swatch--custom ${selectedPreset === "custom" ? "is-selected" : ""}`}
                aria-label="Custom icon color"
                onClick={() => update({ monochromeMode: "custom" })}
              >
                <Plus size={18} weight="bold" />
                <span>Custom</span>
              </button>
            </div>
          </div>
          <label className="settings-color-tools__value">
            <span className="settings-color-tools__label">Color value</span>
            <span className="settings-hex-input">
              <span className="sr-only">Custom monochrome icon color</span>
              <input
                type="color"
                value={
                  /^#[0-9a-fA-F]{6}$/.test(displayColor)
                    ? displayColor
                    : "#6366f1"
                }
                onChange={(event) =>
                  update({
                    monochromeMode: "custom",
                    monochromeColor: event.target.value,
                  })
                }
              />
              <input
                value={displayColor}
                onChange={(event) =>
                  update({
                    monochromeMode: "custom",
                    monochromeColor: event.target.value,
                  })
                }
                pattern="^#[0-9a-fA-F]{6}$"
                aria-label="Custom monochrome icon color hex value"
              />
            </span>
          </label>
        </div>
      </section>

      <section className="settings-section">
        <h2>Main content layout</h2>
        <RadioGroup className="settings-choice-grid settings-choice-grid--two">
          <ChoiceCard
            checked={layout === "framed"}
            onChange={() => update({ contentLayout: "framed" })}
            label="Framed"
            note="Content sits within a framed container with side padding"
            className="settings-choice-card--horizontal settings-choice-card--layout"
            preview={<MiniSurface variant="blue" layout="framed" />}
          />
          <ChoiceCard
            checked={layout === "edge-to-edge"}
            onChange={() => update({ contentLayout: "edge-to-edge" })}
            label="Edge-to-edge"
            note="Content spans the full width of the screen"
            className="settings-choice-card--horizontal settings-choice-card--layout"
            preview={<MiniSurface variant="blue" layout="edge" />}
          />
        </RadioGroup>
      </section>

      <section className="settings-section settings-sidebar-width-section">
        <div className="settings-section__heading-row">
          <div>
            <h2>Sidebar max width</h2>
            <p>Set the widest size available when the sidebar is expanded.</p>
          </div>
          <output
            className="settings-sidebar-width__value"
            htmlFor="sidebar-max-width-range"
          >
            {sidebarMaxWidth}px
          </output>
        </div>
        <div className="settings-sidebar-width__controls">
          <label
            className="settings-sidebar-width__range"
            htmlFor="sidebar-max-width-range"
          >
            <span>Drag to adjust the maximum width</span>
            <input
              id="sidebar-max-width-range"
              type="range"
              min={SIDEBAR_MAX_WIDTH_MIN}
              max={SIDEBAR_MAX_WIDTH_LIMIT}
              step="1"
              value={sidebarMaxWidth}
              onChange={(event) =>
                update({
                  sidebarMaxWidth: normalizeSidebarMaxWidth(event.target.value),
                })
              }
              aria-label="Sidebar max width"
            />
            <span
              className="settings-sidebar-width__range-labels"
              aria-hidden="true"
            >
              <span>{SIDEBAR_MAX_WIDTH_MIN}px</span>
              <span>{SIDEBAR_MAX_WIDTH_LIMIT}px</span>
            </span>
          </label>
          <label className="settings-sidebar-width__number">
            <span>Pixels</span>
            <input
              type="number"
              min={SIDEBAR_MAX_WIDTH_MIN}
              max={SIDEBAR_MAX_WIDTH_LIMIT}
              step="1"
              value={sidebarMaxWidth}
              onChange={(event) =>
                update({
                  sidebarMaxWidth: normalizeSidebarMaxWidth(event.target.value),
                })
              }
              aria-label="Sidebar max width in pixels"
            />
          </label>
        </div>
      </section>

      <section className="settings-section">
        <h2>Additional sidebar options</h2>
        <div className="settings-row-list">
          <SettingRow
            icon={TextT}
            label="Show labels in collapsed mode"
            note="Display text labels on hover in collapsed state"
          >
            <SettingsToggle
              checked={showLabels}
              onChange={(value) => update({ showCollapsedLabels: value })}
              label="Show labels in collapsed mode"
            />
          </SettingRow>
          <SettingRow
            icon={SidebarSimple}
            label="Show logo when collapsed"
            note="Keep the ProCodrr P visible in the compact rail"
          >
            <SettingsToggle
              checked={showCollapsedLogo}
              onChange={(value) => update({ showCollapsedLogo: value })}
              label="Show logo when collapsed"
            />
          </SettingRow>
          <SettingRow
            icon={Palette}
            label="Show theme icon"
            note="Display the color theme picker in the sidebar"
          >
            <SettingsToggle
              checked={showThemeIcon}
              onChange={(value) => update({ showThemeIcon: value })}
              label="Show theme icon"
            />
          </SettingRow>
          <SettingRow
            icon={CircleHalf}
            label="Highlight active item with filled background"
            note="Use a filled background for the active menu item"
          >
            <SettingsToggle
              checked={highlightActive}
              onChange={(value) => update({ highlightActive: value })}
              label="Highlight active item with filled background"
            />
          </SettingRow>
          <SettingRow
            icon={SidebarSimple}
            label="Hide sidebar"
            note={
              <>
                Bring it back with <kbd>Ctrl+Alt+B</kbd> (or{" "}
                <kbd>Command+Option+B</kbd> on Mac), or move the cursor to the
                left edge of the screen.
              </>
            }
          >
            <SettingsToggle
              checked={sidebarHidden}
              onChange={(value) =>
                onSidebarModeChange?.(value ? "hidden" : "expanded")
              }
              label="Hide sidebar"
            />
          </SettingRow>
        </div>
      </section>
    </div>
  );
}
