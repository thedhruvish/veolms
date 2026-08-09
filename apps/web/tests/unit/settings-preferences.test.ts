import { describe, expect, it } from "vitest";
import {
  LEARNING_PREFERENCE_DEFAULTS,
  LEARNING_PREFERENCES_KEY,
  normalizeSidebarMaxWidth,
  readLearningPreferences,
} from "../../src/settings/settingsPreferences.js";

describe("sidebar width preferences", () => {
  it("clamps numeric values to the supported inclusive range", () => {
    expect(normalizeSidebarMaxWidth(220)).toBe(220);
    expect(normalizeSidebarMaxWidth(420)).toBe(420);
    expect(normalizeSidebarMaxWidth(520)).toBe(520);
    expect(normalizeSidebarMaxWidth(219)).toBe(220);
    expect(normalizeSidebarMaxWidth(521)).toBe(520);
  });

  it("uses the existing default for non-numeric values", () => {
    expect(normalizeSidebarMaxWidth("not-a-width")).toBe(300);
    expect(normalizeSidebarMaxWidth(Infinity)).toBe(300);
  });
});

describe("learning preference persistence", () => {
  it("uses defaults when no stored preference exists", () => {
    expect(readLearningPreferences()).toEqual(LEARNING_PREFERENCE_DEFAULTS);
  });

  it("merges valid stored preferences while retaining supported defaults", () => {
    localStorage.setItem(
      LEARNING_PREFERENCES_KEY,
      JSON.stringify({
        videoQuality: "1080",
        reminderDays: ["sat", "sun"],
      }),
    );

    expect(readLearningPreferences()).toEqual({
      ...LEARNING_PREFERENCE_DEFAULTS,
      videoQuality: "1080",
      reminderDays: ["sat", "sun"],
    });
  });

  it("returns the existing default object for invalid JSON", () => {
    localStorage.setItem(LEARNING_PREFERENCES_KEY, "{");

    expect(readLearningPreferences()).toBe(LEARNING_PREFERENCE_DEFAULTS);
  });

  it("falls back to default reminder days when stored days are not an array", () => {
    localStorage.setItem(
      LEARNING_PREFERENCES_KEY,
      JSON.stringify({
        reminderDays: "weekdays",
      }),
    );

    expect(readLearningPreferences()).toEqual({
      ...LEARNING_PREFERENCE_DEFAULTS,
      reminderDays: LEARNING_PREFERENCE_DEFAULTS.reminderDays,
    });
  });
});
