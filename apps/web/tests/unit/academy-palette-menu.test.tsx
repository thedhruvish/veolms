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
    const onPreview = vi.fn();
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    const { container } = render(
      <AcademyPaletteMenu
        themes={themes}
        selectedTheme="ocean"
        className="sidebar-palette-menu mobile-palette-menu"
        id="mobile-theme-menu"
        mobile
        onSelect={onSelect}
        onPreview={onPreview}
        onConfirm={onConfirm}
        onCancel={onCancel}
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

  it("previews with arrow keys, confirms with Enter, and ignores hover", () => {
    const onSelect = vi.fn();
    const onPreview = vi.fn();
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(
      <AcademyPaletteMenu
        themes={themes}
        selectedTheme="graphite"
        onSelect={onSelect}
        onPreview={onPreview}
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    );

    const menu = screen.getByRole("menu", { name: "Choose a color theme" });
    const graphite = screen.getByRole("menuitemradio", { name: /Graphite/ });
    const ocean = screen.getByRole("menuitemradio", { name: /Ocean Blue/ });

    expect(graphite).toHaveFocus();
    fireEvent.mouseEnter(ocean);
    expect(onPreview).not.toHaveBeenCalled();

    fireEvent.keyDown(menu, { key: "ArrowDown" });
    expect(onPreview).toHaveBeenLastCalledWith("ocean");
    expect(ocean).toHaveFocus();
    expect(ocean).toHaveAttribute("aria-checked", "true");
    expect(graphite).toHaveAttribute("aria-checked", "false");

    fireEvent.keyDown(menu, { key: "ArrowUp" });
    expect(onPreview).toHaveBeenLastCalledWith("graphite");
    expect(graphite).toHaveFocus();

    fireEvent.keyDown(menu, { key: "ArrowDown" });
    fireEvent.keyDown(menu, { key: "Enter" });
    expect(onConfirm).toHaveBeenCalledWith("ocean");

    fireEvent.keyDown(menu, { key: "Escape" });
    expect(onCancel).toHaveBeenCalledOnce();
    expect(onSelect).not.toHaveBeenCalled();
  });
});
