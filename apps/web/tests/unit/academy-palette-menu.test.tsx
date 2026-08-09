import { fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import { describe, expect, it, vi } from "vitest";
import { AcademyPaletteMenu } from "../../src/shell/AcademyPaletteMenu.tsx";

const themes = [
  {
    id: "graphite",
    name: "Graphite",
    note: "Neutral dark",
    preview: "#1e1e1e",
    darkInk: false,
  },
  {
    id: "ocean",
    name: "Ocean Blue",
    note: "Cool contrast",
    preview: "#2277cc",
    darkInk: true,
  },
];

describe("AcademyPaletteMenu", () => {
  it("renders selected state and delegates the selected theme id", () => {
    const onSelect = vi.fn();
    const { container } = render(
      <AcademyPaletteMenu
        themes={themes}
        selectedTheme="ocean"
        className="sidebar-palette-menu mobile-palette-menu"
        id="mobile-theme-menu"
        mobile
        onSelect={onSelect}
      />,
    );

    const menu = screen.getByRole("menu", { name: "Choose a color theme" });
    const selected = screen.getByRole("menuitemradio", { name: /Ocean Blue/ });

    expect(menu).toHaveClass("sidebar-palette-menu", "mobile-palette-menu");
    expect(menu).toHaveAttribute("id", "mobile-theme-menu");
    expect(menu).toHaveAttribute("data-mobile-palette-menu");
    expect(selected).toHaveAttribute("aria-checked", "true");
    expect(selected).toHaveClass("is-selected");
    expect(
      screen.getByRole("menuitemradio", { name: /Graphite/ }),
    ).toHaveAttribute("aria-checked", "false");
    expect(container.querySelector("button i")).toHaveStyle({
      background: "rgb(30, 30, 30)",
    });

    fireEvent.click(selected);
    expect(onSelect).toHaveBeenCalledWith("ocean");
  });
});
