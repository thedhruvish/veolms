import { describe, expect, it } from "vitest";
import {
  academyThemes,
  getInitialAcademyTheme,
  persistAcademyTheme,
} from "../../src/themes.js";

const PALETTE_VERSION = "graphite-default-v1";

describe("academy theme persistence", () => {
  it("defaults to Graphite when no compatible preference exists", () => {
    expect(getInitialAcademyTheme()).toBe("graphite");

    localStorage.setItem("veolms-academy-theme", "ocean");
    expect(getInitialAcademyTheme()).toBe("graphite");
  });

  it("restores a known palette only for the current preference version", () => {
    localStorage.setItem("veolms-academy-theme-version", PALETTE_VERSION);
    localStorage.setItem("veolms-academy-theme", "ocean");
    expect(getInitialAcademyTheme()).toBe("ocean");

    localStorage.setItem("veolms-academy-theme", "not-a-palette");
    expect(getInitialAcademyTheme()).toBe("graphite");
  });

  it("writes the palette and compatibility version together", () => {
    persistAcademyTheme("rose");

    expect(localStorage.getItem("veolms-academy-theme")).toBe("rose");
    expect(localStorage.getItem("veolms-academy-theme-version")).toBe(
      PALETTE_VERSION,
    );
  });

  it("keeps palette identifiers unique", () => {
    const ids = academyThemes.map(({ id }) => id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toContain("graphite");
  });
});
