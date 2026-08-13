import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AppSlider } from "../../src/AppSlider";

describe("AppSlider", () => {
  it("maps its value to a clamped progress fill", () => {
    const { rerender } = render(
      <AppSlider
        aria-label="Example"
        min={20}
        max={120}
        value={70}
        onChange={() => undefined}
      />,
    );
    const slider = screen.getByRole("slider", { name: "Example" });

    expect(slider).toHaveClass("app-slider", "app-slider--accent");
    expect(slider.getAttribute("style")).toContain(
      "--app-slider-progress: 50%",
    );

    rerender(
      <AppSlider
        aria-label="Example"
        min={20}
        max={120}
        value={160}
        variant="temperature"
        onChange={() => undefined}
      />,
    );
    expect(slider).toHaveClass("app-slider--temperature");
    expect(slider.getAttribute("style")).toContain(
      "--app-slider-progress: 100%",
    );
  });
});
