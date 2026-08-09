import { describe, expect, it } from "vitest";
import {
  clampSidebarMaxWidth,
  clampSidebarWidth,
  getInitialSidebarPreferences,
  getInitialSidebarWidth,
} from "../../src/shell/sidebarPreferences.js";

const defaultPreferences = {
  iconStyle: "multicolor",
  monochromeMode: "theme",
  monochromeColor: "#6c78ff",
  contentLayout: "framed",
  sidebarMaxWidth: 300,
  showCollapsedLabels: true,
  showCollapsedLogo: true,
  highlightActive: true,
};

describe("sidebar width helpers", () => {
  it("preserves the current width and custom-maximum clamping rules", () => {
    expect(clampSidebarMaxWidth(219)).toBe(220);
    expect(clampSidebarMaxWidth("420")).toBe(420);
    expect(clampSidebarMaxWidth(521)).toBe(520);
    expect(clampSidebarMaxWidth("not-a-width")).toBe(300);
    expect(clampSidebarMaxWidth(Infinity)).toBe(300);

    expect(clampSidebarWidth(180, 420)).toBe(220);
    expect(clampSidebarWidth(360, 420)).toBe(360);
    expect(clampSidebarWidth(480, 420)).toBe(420);
    expect(clampSidebarWidth(480)).toBe(300);
    expect(Number.isNaN(clampSidebarWidth("not-a-width", 420))).toBe(true);
  });

  it("retains missing-key coercion and the fixed initial 300-pixel cap", () => {
    expect(getInitialSidebarWidth()).toBe(220);

    localStorage.setItem("veolms-sidebar-width", "275");
    expect(getInitialSidebarWidth()).toBe(275);

    localStorage.setItem("veolms-sidebar-width", "420");
    expect(getInitialSidebarWidth()).toBe(300);

    localStorage.setItem("veolms-sidebar-width", "invalid");
    expect(getInitialSidebarWidth()).toBe(300);
  });
});

describe("sidebar preference storage", () => {
  it("returns defaults and stamps the max-width version on first read", () => {
    expect(getInitialSidebarPreferences()).toEqual(defaultPreferences);
    expect(
      localStorage.getItem("veolms-sidebar-max-width-default-version"),
    ).toBe("300px-v1");
    expect(localStorage.getItem("veolms-sidebar-preferences")).toBeNull();
  });

  it("resets a stored custom maximum once when the version is stale", () => {
    localStorage.setItem(
      "veolms-sidebar-max-width-default-version",
      "older-version",
    );
    localStorage.setItem(
      "veolms-sidebar-preferences",
      JSON.stringify({
        iconStyle: "monochrome",
        sidebarMaxWidth: 420,
        retainedUnknownField: true,
      }),
    );

    expect(getInitialSidebarPreferences()).toEqual({
      ...defaultPreferences,
      iconStyle: "monochrome",
      sidebarMaxWidth: 300,
      retainedUnknownField: true,
    });
    expect(
      localStorage.getItem("veolms-sidebar-max-width-default-version"),
    ).toBe("300px-v1");
    const storedPreferences = localStorage.getItem(
      "veolms-sidebar-preferences",
    );
    expect(storedPreferences).not.toBeNull();
    expect(JSON.parse(storedPreferences ?? "null")).toEqual({
      iconStyle: "monochrome",
      sidebarMaxWidth: 420,
      retainedUnknownField: true,
    });
  });

  it("preserves a custom maximum when the stored version is current", () => {
    localStorage.setItem(
      "veolms-sidebar-max-width-default-version",
      "300px-v1",
    );
    localStorage.setItem(
      "veolms-sidebar-preferences",
      JSON.stringify({
        contentLayout: "full-width",
        sidebarMaxWidth: 420,
      }),
    );

    expect(getInitialSidebarPreferences()).toEqual({
      ...defaultPreferences,
      contentLayout: "full-width",
      sidebarMaxWidth: 420,
    });
  });

  it("returns defaults for invalid JSON without stamping the migration version", () => {
    localStorage.setItem("veolms-sidebar-preferences", "{");

    expect(getInitialSidebarPreferences()).toEqual(defaultPreferences);
    expect(
      localStorage.getItem("veolms-sidebar-max-width-default-version"),
    ).toBeNull();
    expect(localStorage.getItem("veolms-sidebar-preferences")).toBe("{");
  });
});
