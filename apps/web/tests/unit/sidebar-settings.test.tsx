import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SidebarSettings } from "../../src/settings/SidebarSettings";
import type { SidebarPreferences } from "../../src/settings/settingsPreferences";

const preferences: SidebarPreferences = {
  iconStyle: "monochrome",
  monochromeMode: "custom",
  monochromeColor: "#123456",
  sidebarMaxWidth: 300,
};

const renderSettings = (onChange: (next: SidebarPreferences) => void) =>
  render(
    <SidebarSettings
      sidebarPreferences={preferences}
      onSidebarPreferencesChange={onChange}
      academyTheme="veo-onyx"
      sidebarMode="expanded"
    />,
  );

describe("sidebar settings draft inputs", () => {
  it("commits a normalized width only on blur or Enter", () => {
    const onChange = vi.fn();
    renderSettings(onChange);
    const input = screen.getByRole("spinbutton", {
      name: "Sidebar max width in pixels",
    });

    fireEvent.change(input, { target: { value: "420" } });
    expect(onChange).not.toHaveBeenCalled();

    fireEvent.blur(input);
    expect(onChange).toHaveBeenLastCalledWith({
      ...preferences,
      sidebarMaxWidth: 420,
    });

    onChange.mockClear();
    fireEvent.change(input, { target: { value: "999" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onChange).toHaveBeenLastCalledWith({
      ...preferences,
      sidebarMaxWidth: 520,
    });
    expect(input).toHaveValue(520);
  });

  it("keeps invalid hex drafts local and only persists complete colors", () => {
    const onChange = vi.fn();
    renderSettings(onChange);
    const input = screen.getByRole("textbox", {
      name: "Custom monochrome icon color hex value",
    });

    fireEvent.change(input, { target: { value: "#123" } });
    fireEvent.blur(input);
    expect(onChange).not.toHaveBeenCalled();
    expect(input).toHaveValue("#123");
    expect(input).toHaveAttribute("aria-invalid", "true");

    fireEvent.change(input, { target: { value: "#abcdef" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onChange).toHaveBeenLastCalledWith({
      ...preferences,
      monochromeMode: "custom",
      monochromeColor: "#abcdef",
    });
    expect(input).toHaveAttribute("aria-invalid", "false");
  });
});
