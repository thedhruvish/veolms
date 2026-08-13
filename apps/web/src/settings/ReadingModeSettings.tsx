import { useEffect, useState } from "react";
import type { CSSProperties } from "react";
import {
  ArrowCounterClockwise,
  BookOpenText,
  Grains,
  ThermometerSimple,
} from "@phosphor-icons/react";
import { AppSlider } from "../AppSlider";
import {
  getReadingModeVisuals,
  persistReadingModePreferences,
  READING_MODE_DEFAULTS,
  READING_MODE_STORAGE_KEY,
  readReadingModePreferences,
} from "../reading-mode/readingModePreferences";
import type { ReadingModePreferences } from "../reading-mode/readingModePreferences";
import { SettingRow, SettingsToggle } from "./SettingsControls";

type ReadingModePreviewStyle = CSSProperties & {
  "--reading-mode-preview-texture-opacity": string;
  "--reading-mode-preview-temperature-color": string;
  "--reading-mode-preview-temperature-opacity": string;
};

interface ReadingModeRangeProps {
  id: string;
  label: string;
  value: number;
  kind: "temperature" | "texture";
  onChange: (value: number) => void;
}

const getTemperatureLabel = (value: number): string => {
  if (value === 50) return "Neutral";
  return value < 50 ? `${50 - value}% cooler` : `${value - 50}% warmer`;
};

function ReadingModeRange({
  id,
  label,
  value,
  kind,
  onChange,
}: ReadingModeRangeProps) {
  const valueText =
    kind === "temperature" ? getTemperatureLabel(value) : `${value}% texture`;

  return (
    <div className={`settings-reading-mode__range is-${kind}`}>
      <div className="settings-reading-mode__range-value" aria-hidden="true">
        <span>{kind === "temperature" ? "Cool to warm" : "Paper grain"}</span>
        <output htmlFor={id}>
          {kind === "temperature" ? valueText : `${value}%`}
        </output>
      </div>
      <AppSlider
        id={id}
        min="0"
        max="100"
        step="1"
        value={value}
        variant={kind === "temperature" ? "temperature" : "accent"}
        aria-label={label}
        aria-valuetext={valueText}
        onChange={(event) => onChange(Number(event.currentTarget.value))}
      />
      <div className="settings-reading-mode__range-labels" aria-hidden="true">
        {kind === "temperature" ? (
          <>
            <span>Cool</span>
            <span>Neutral</span>
            <span>Warm</span>
          </>
        ) : (
          <>
            <span>None</span>
            <span>Fine</span>
            <span>Paper</span>
          </>
        )}
      </div>
    </div>
  );
}

function ReadingModePreview({
  preferences,
}: {
  preferences: ReadingModePreferences;
}) {
  const visuals = getReadingModeVisuals(preferences);
  const style = {
    "--reading-mode-preview-texture-opacity":
      visuals.textureOpacityDark.toFixed(5),
    "--reading-mode-preview-temperature-color": visuals.temperatureColor,
    "--reading-mode-preview-temperature-opacity":
      visuals.temperatureOpacity.toFixed(5),
  } as ReadingModePreviewStyle;

  return (
    <div className="settings-reading-mode__preview-block">
      <div className="settings-reading-mode__preview-heading">
        <strong>Live preview</strong>
        <span>{preferences.enabled ? "Applied to app" : "Preview only"}</span>
      </div>
      <div
        className="settings-reading-mode__preview"
        style={style}
        role="img"
        aria-label={`Reading mode preview: ${getTemperatureLabel(preferences.colorTemperature)}, ${preferences.texture}% texture`}
      >
        <div
          className="settings-reading-mode__preview-scene"
          aria-hidden="true"
        >
          <span className="settings-reading-mode__preview-rail">
            <i />
            <i />
            <i />
            <i />
          </span>
          <span className="settings-reading-mode__preview-content">
            <b>Reading mode</b>
            <small>Comfortable focus across every lesson</small>
            <span>
              <i />
              <i />
              <i />
            </span>
          </span>
        </div>
        <span
          className="settings-reading-mode__preview-texture"
          aria-hidden="true"
        />
        <span
          className="settings-reading-mode__preview-temperature"
          aria-hidden="true"
        />
      </div>
      <p>
        Tune the preview first, then enable reading mode when it feels right.
      </p>
    </div>
  );
}

export function ReadingModeSettings() {
  const [preferences, setPreferences] = useState(readReadingModePreferences);

  useEffect(() => {
    const handleStorage = (event: StorageEvent) => {
      if (event.key === READING_MODE_STORAGE_KEY || event.key === null) {
        setPreferences(readReadingModePreferences());
      }
    };
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, []);

  const updatePreferences = (updates: Partial<ReadingModePreferences>) => {
    setPreferences(
      persistReadingModePreferences({ ...preferences, ...updates }),
    );
  };
  const restoreDefaults = () => {
    setPreferences(
      persistReadingModePreferences({
        ...preferences,
        colorTemperature: READING_MODE_DEFAULTS.colorTemperature,
        texture: READING_MODE_DEFAULTS.texture,
      }),
    );
  };
  const slidersAreDefault =
    preferences.colorTemperature === READING_MODE_DEFAULTS.colorTemperature &&
    preferences.texture === READING_MODE_DEFAULTS.texture;

  return (
    <section className="settings-section settings-reading-mode">
      <div className="settings-reading-mode__heading">
        <div>
          <h2>Reading mode</h2>
          <p>Shift the display tone and add a fixed, paper-like grain.</p>
        </div>
        <button
          type="button"
          className={`settings-reading-mode__status ${preferences.enabled ? "is-enabled" : ""}`}
          aria-label={`Turn reading mode ${preferences.enabled ? "off" : "on"}`}
          aria-pressed={preferences.enabled}
          onClick={() => updatePreferences({ enabled: !preferences.enabled })}
        >
          {preferences.enabled ? "On" : "Off"}
        </button>
      </div>

      <ReadingModePreview preferences={preferences} />

      <div className="settings-row-list settings-reading-mode__controls">
        <SettingRow
          icon={BookOpenText}
          label="Reading mode"
          note="Apply your selected temperature and texture across the application"
        >
          <SettingsToggle
            checked={preferences.enabled}
            onChange={(enabled) => updatePreferences({ enabled })}
            label="Reading mode"
          />
        </SettingRow>
        <SettingRow
          className="settings-row--reading-range"
          icon={ThermometerSimple}
          label="Color temperature"
          note="Keep neutral at 50, or shift toward a cooler or warmer white point"
        >
          <ReadingModeRange
            id="reading-mode-color-temperature"
            label="Color temperature"
            value={preferences.colorTemperature}
            kind="temperature"
            onChange={(colorTemperature) =>
              updatePreferences({ colorTemperature })
            }
          />
        </SettingRow>
        <SettingRow
          className="settings-row--reading-range"
          icon={Grains}
          label="Texture"
          note="Add fine static grain without softening text, images, or video"
        >
          <ReadingModeRange
            id="reading-mode-texture"
            label="Texture"
            value={preferences.texture}
            kind="texture"
            onChange={(texture) => updatePreferences({ texture })}
          />
        </SettingRow>
      </div>

      <button
        type="button"
        className="settings-reading-mode__restore"
        disabled={slidersAreDefault}
        onClick={restoreDefaults}
      >
        <ArrowCounterClockwise size={17} weight="bold" />
        Restore defaults
      </button>
    </section>
  );
}
