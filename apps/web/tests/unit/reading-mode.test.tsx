import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import {
  applyReadingModePreferences,
  getReadingModeVisuals,
  normalizeReadingModePreferences,
  persistReadingModePreferences,
  READING_MODE_DEFAULTS,
  READING_MODE_STORAGE_KEY,
  readReadingModePreferences,
} from "../../src/reading-mode/readingModePreferences.ts";
import { ReadingModeSettings } from "../../src/settings/ReadingModeSettings.tsx";

beforeEach(() => {
  delete document.documentElement.dataset.readingMode;
  document.documentElement.removeAttribute("style");
});

describe("reading mode preferences", () => {
  it("uses disabled, neutral defaults with paper texture set to 90%", () => {
    expect(readReadingModePreferences()).toEqual(READING_MODE_DEFAULTS);
  });

  it("normalizes malformed and out-of-range stored values", () => {
    expect(
      normalizeReadingModePreferences({
        enabled: "yes",
        colorTemperature: 140,
        texture: -12,
      }),
    ).toEqual({ enabled: false, colorTemperature: 100, texture: 0 });
  });

  it("uses the nonlinear texture curve and a truly neutral midpoint", () => {
    const zero = getReadingModeVisuals({ colorTemperature: 50, texture: 0 });
    const medium = getReadingModeVisuals({
      colorTemperature: 50,
      texture: 75,
    });
    const maximum = getReadingModeVisuals({
      colorTemperature: 100,
      texture: 100,
    });

    expect(zero.textureOpacityDark).toBe(0);
    expect(zero.temperatureOpacity).toBe(0);
    expect(medium.textureStrength).toBeCloseTo(Math.pow(0.75, 1.3), 6);
    expect(medium.textureOpacityDark).toBeCloseTo(0.15136, 4);
    expect(maximum.textureOpacityDark).toBe(0.22);
    expect(maximum.textureOpacityLight).toBe(0.14);
    expect(maximum.temperatureOpacity).toBe(0.3);
  });

  it("applies and persists one coherent preference object", () => {
    const preferences = persistReadingModePreferences({
      enabled: true,
      colorTemperature: 80,
      texture: 75,
    });

    expect(
      JSON.parse(localStorage.getItem(READING_MODE_STORAGE_KEY) || ""),
    ).toEqual(preferences);
    expect(document.documentElement).toHaveAttribute(
      "data-reading-mode",
      "true",
    );
    expect(
      document.documentElement.style.getPropertyValue(
        "--reading-mode-texture-opacity-dark",
      ),
    ).toBe("0.15136");

    applyReadingModePreferences({ ...preferences, enabled: false });
    expect(
      document.documentElement.style.getPropertyValue(
        "--reading-mode-temperature-opacity",
      ),
    ).toBe("0");
  });
});

describe("reading mode settings", () => {
  it("preserves configured values while disabled and restores only the sliders", () => {
    render(<ReadingModeSettings />);

    const toggle = screen.getByRole("switch", { name: "Reading mode" });
    const temperature = screen.getByRole("slider", {
      name: "Color temperature",
    });
    const texture = screen.getByRole("slider", { name: "Texture" });
    const restore = screen.getByRole("button", { name: "Restore defaults" });
    const quickToggle = screen.getByRole("button", {
      name: "Turn reading mode on",
    });
    const previewGuidance = screen.getByText(
      "Tune the preview first, then enable reading mode when it feels right.",
    );

    expect(toggle).toHaveAttribute("aria-checked", "false");
    expect(temperature).toHaveValue("50");
    expect(texture).toHaveValue("90");
    expect(restore).toBeDisabled();
    expect(previewGuidance).toBeVisible();
    expect(quickToggle).toHaveAttribute("aria-pressed", "false");

    fireEvent.click(quickToggle);
    expect(toggle).toHaveAttribute("aria-checked", "true");
    expect(quickToggle).toHaveAttribute("aria-pressed", "true");
    expect(quickToggle).toHaveAccessibleName("Turn reading mode off");

    fireEvent.click(quickToggle);
    expect(toggle).toHaveAttribute("aria-checked", "false");

    fireEvent.change(temperature, { target: { value: "85" } });
    fireEvent.change(texture, { target: { value: "75" } });
    expect(texture.getAttribute("style")).toContain(
      "--app-slider-progress: 75%",
    );
    expect(document.documentElement).toHaveAttribute(
      "data-reading-mode",
      "false",
    );
    expect(texture).toHaveValue("75");

    fireEvent.click(toggle);
    expect(document.documentElement).toHaveAttribute(
      "data-reading-mode",
      "true",
    );
    expect(previewGuidance).toBeVisible();
    expect(quickToggle).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(toggle);
    expect(texture).toHaveValue("75");
    expect(temperature).toHaveValue("85");

    fireEvent.click(restore);
    expect(toggle).toHaveAttribute("aria-checked", "false");
    expect(temperature).toHaveValue("50");
    expect(texture).toHaveValue("90");

    fireEvent.click(toggle);
    fireEvent.change(temperature, { target: { value: "15" } });
    fireEvent.change(texture, { target: { value: "20" } });
    fireEvent.click(restore);
    expect(toggle).toHaveAttribute("aria-checked", "true");
    expect(temperature).toHaveValue("50");
    expect(texture).toHaveValue("90");
  });
});
