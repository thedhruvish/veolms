import { useEffect, useState } from "react";
import {
  ArrowsInLineHorizontal,
  CircleHalf,
  DeviceMobile,
  Moon,
  SidebarSimple,
  Sparkle,
  Sun,
  TextAa,
} from "@phosphor-icons/react";
import { academyThemes } from "../themes";
import type { AcademyTheme } from "../themes";
import {
  ChoiceCard,
  RadioGroup,
  SettingRow,
  SettingsToggle,
} from "./SettingsControls";
import { MiniSurface } from "./SettingsPreviews";
import { readStored, readStoredBoolean } from "./settingsPreferences";

export type DisplayMode = "light" | "dark" | "device";

interface DisplayModeOption {
  id: DisplayMode;
  label: string;
  note: string;
  icon: typeof Sun;
}

const DISPLAY_MODES: readonly DisplayModeOption[] = [
  { id: "light", label: "Light", note: "Use a light color scheme", icon: Sun },
  { id: "dark", label: "Dark", note: "Use a dark color scheme", icon: Moon },
  {
    id: "device",
    label: "Use device setting",
    note: "Match your system preference",
    icon: DeviceMobile,
  },
];

// Keep Settings in lockstep with the sidebar and mobile palette menus. This is
// deliberately the shared registry rather than a display-only subset.
const COLOR_THEMES = academyThemes;

export interface AppearanceSettingsProps {
  theme: DisplayMode;
  onThemeChange?: (theme: DisplayMode) => void;
  academyTheme: string;
  onAcademyThemeChange?: (themeId: AcademyTheme["id"]) => void;
}

export function AppearanceSettings({
  theme,
  onThemeChange,
  academyTheme,
  onAcademyThemeChange,
}: AppearanceSettingsProps) {
  const [reduceAnimations, setReduceAnimations] = useState(() =>
    readStoredBoolean("veolms-reduce-animations", false),
  );
  const [highContrast, setHighContrast] = useState(() =>
    readStoredBoolean("veolms-high-contrast", false),
  );
  const [compactLayout, setCompactLayout] = useState(() =>
    readStoredBoolean("veolms-compact-layout", false),
  );
  const [hideScrollbars, setHideScrollbars] = useState(() =>
    readStoredBoolean("veolms-hide-scrollbars", false),
  );
  const [textSize, setTextSize] = useState(() =>
    readStored("veolms-text-size", "default"),
  );
  const selectedColor = COLOR_THEMES.some((item) => item.id === academyTheme)
    ? academyTheme
    : "graphite";

  useEffect(() => {
    document.documentElement.dataset.reduceAnimations =
      String(reduceAnimations);
    window.localStorage.setItem(
      "veolms-reduce-animations",
      String(reduceAnimations),
    );
  }, [reduceAnimations]);
  useEffect(() => {
    document.documentElement.dataset.highContrast = String(highContrast);
    window.localStorage.setItem("veolms-high-contrast", String(highContrast));
  }, [highContrast]);
  useEffect(() => {
    document.documentElement.dataset.compactLayout = String(compactLayout);
    window.localStorage.setItem("veolms-compact-layout", String(compactLayout));
  }, [compactLayout]);
  useEffect(() => {
    document.documentElement.dataset.hideScrollbars = String(hideScrollbars);
    window.localStorage.setItem(
      "veolms-hide-scrollbars",
      String(hideScrollbars),
    );
  }, [hideScrollbars]);
  useEffect(() => {
    document.documentElement.dataset.textSize = textSize;
    window.localStorage.setItem("veolms-text-size", textSize);
  }, [textSize]);

  return (
    <div className="settings-content">
      <section className="settings-section">
        <h2>Display mode</h2>
        <RadioGroup className="settings-choice-grid settings-choice-grid--display">
          {DISPLAY_MODES.map(({ id, label, note, icon }) => (
            <ChoiceCard
              key={id}
              checked={theme === id}
              onChange={() => onThemeChange?.(id)}
              label={label}
              note={note}
              icon={icon}
              className="settings-choice-card--stacked"
              preview={
                <MiniSurface
                  variant={selectedColor}
                  previewMode={
                    id === "light" ? "light" : id === "dark" ? "dark" : "device"
                  }
                />
              }
            />
          ))}
        </RadioGroup>
      </section>

      <section className="settings-section">
        <h2>Color theme</h2>
        <RadioGroup className="settings-choice-grid settings-choice-grid--colors">
          {COLOR_THEMES.map((item) => (
            <ChoiceCard
              key={item.id}
              checked={selectedColor === item.id}
              onChange={() => onAcademyThemeChange?.(item.id)}
              label={item.name}
              note={item.note}
              className="settings-choice-card--stacked settings-choice-card--theme"
              preview={<MiniSurface variant={item.id} previewMode="dark" />}
            />
          ))}
        </RadioGroup>
      </section>

      <section className="settings-section">
        <h2>Interface</h2>
        <div className="settings-row-list">
          <SettingRow
            icon={Sparkle}
            label="Reduce animations"
            note="Minimize motion for a calmer experience"
          >
            <SettingsToggle
              checked={reduceAnimations}
              onChange={setReduceAnimations}
              label="Reduce animations"
            />
          </SettingRow>
          <SettingRow
            icon={CircleHalf}
            label="High contrast mode"
            note="Increase contrast for better visibility"
          >
            <SettingsToggle
              checked={highContrast}
              onChange={setHighContrast}
              label="High contrast mode"
            />
          </SettingRow>
          <SettingRow
            icon={ArrowsInLineHorizontal}
            label="Compact layout"
            note="Show more content in less space"
          >
            <SettingsToggle
              checked={compactLayout}
              onChange={setCompactLayout}
              label="Compact layout"
            />
          </SettingRow>
          <SettingRow
            icon={SidebarSimple}
            label="Hide scrollbars"
            note="Keep scrolling enabled while hiding the visual scrollbars"
          >
            <SettingsToggle
              checked={hideScrollbars}
              onChange={setHideScrollbars}
              label="Hide scrollbars"
            />
          </SettingRow>
          <SettingRow
            className="settings-row--text-size"
            icon={TextAa}
            label="Text size"
            note="Adjust the size of text across the application"
          >
            <div
              className="settings-segmented settings-segmented--text-size"
              role="radiogroup"
              aria-label="Text size"
            >
              {(
                [
                  ["small", "Small"],
                  ["default", "Default"],
                  ["large", "Large"],
                  ["extra-large", "Extra large"],
                ] as const
              ).map(([value, label]) => (
                <button
                  type="button"
                  key={value}
                  role="radio"
                  aria-checked={textSize === value}
                  className={textSize === value ? "is-selected" : ""}
                  onClick={() => setTextSize(value)}
                >
                  {label}
                </button>
              ))}
            </div>
          </SettingRow>
        </div>
      </section>
    </div>
  );
}
