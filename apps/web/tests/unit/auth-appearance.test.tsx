import { render } from "@testing-library/react";
import React from "react";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AuthLayout from "../../src/routes/auth-layout.tsx";
import { useAuthAppearance } from "../../src/auth/useAuthAppearance.ts";

vi.mock("../../src/auth/AuthBrandPanel.tsx", () => ({
  AuthBrandPanel: () => null,
}));

function AppearanceHarness() {
  useAuthAppearance();
  return null;
}

function storePalette(palette: string) {
  window.localStorage.setItem("veolms-academy-theme", palette);
  window.localStorage.setItem(
    "veolms-academy-theme-version",
    "veo-onyx-default-v2",
  );
}

beforeEach(() => {
  const root = document.documentElement;
  root.dataset.theme = "dark";
  root.dataset.palette = "codex";
  delete root.dataset.reduceAnimations;
  delete root.dataset.highContrast;
});

describe("useAuthAppearance", () => {
  it("keeps the document defaults when nothing is stored", () => {
    render(<AppearanceHarness />);

    expect(document.documentElement.dataset.palette).toBe("codex");
    expect(document.documentElement.dataset.theme).toBe("dark");
  });

  it("applies the stored academy palette", () => {
    storePalette("graphite");

    render(<AppearanceHarness />);

    expect(document.documentElement.dataset.palette).toBe("graphite");
  });

  it("falls back to the default palette when the stored value is unknown", () => {
    storePalette("not-a-real-palette");

    render(<AppearanceHarness />);

    expect(document.documentElement.dataset.palette).toBe("codex");
  });

  it("applies the stored light or dark choice", () => {
    window.localStorage.setItem("veolms-theme", "light");

    render(<AppearanceHarness />);

    expect(document.documentElement.dataset.theme).toBe("light");
  });

  it("falls back to the default theme when the stored choice is unknown", () => {
    window.localStorage.setItem("veolms-theme", "neon");

    render(<AppearanceHarness />);

    expect(document.documentElement.dataset.theme).toBe("dark");
  });

  it("resolves the device choice against the color scheme media query", () => {
    window.localStorage.setItem("veolms-theme", "device");

    render(<AppearanceHarness />);

    expect(document.documentElement.dataset.theme).toBe("light");
  });

  it("applies the stored reduce-animations preference", () => {
    window.localStorage.setItem("veolms-reduce-animations", "true");

    render(<AppearanceHarness />);

    expect(document.documentElement.dataset.reduceAnimations).toBe("true");
  });

  it("applies the stored high-contrast preference", () => {
    window.localStorage.setItem("veolms-high-contrast", "true");

    render(<AppearanceHarness />);

    expect(document.documentElement.dataset.highContrast).toBe("true");
  });

  it("leaves the accessibility toggles off when nothing is stored", () => {
    render(<AppearanceHarness />);

    expect(document.documentElement.dataset.reduceAnimations).toBe("false");
    expect(document.documentElement.dataset.highContrast).toBe("false");
  });

  it("renders quietly when storage cannot be read", () => {
    const consoleError = vi.spyOn(console, "error");
    vi.spyOn(window, "localStorage", "get").mockImplementation(() => {
      throw new Error("storage is disabled");
    });

    expect(() => render(<AppearanceHarness />)).not.toThrow();

    expect(document.documentElement.dataset.palette).toBe("codex");
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(consoleError).not.toHaveBeenCalled();
  });
});

describe("AuthLayout", () => {
  it("applies the stored appearance on a direct visit", () => {
    storePalette("ocean");
    window.localStorage.setItem("veolms-theme", "light");

    render(
      <MemoryRouter initialEntries={["/login"]}>
        <AuthLayout />
      </MemoryRouter>,
    );

    expect(document.documentElement.dataset.palette).toBe("ocean");
    expect(document.documentElement.dataset.theme).toBe("light");
  });
});
