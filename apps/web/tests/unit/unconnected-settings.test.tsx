import { render, screen } from "@testing-library/react";
import React from "react";
import { describe, expect, it } from "vitest";
import { AccountSettings } from "../../src/settings/AccountSettings.tsx";
import { SecuritySettings } from "../../src/settings/SecuritySettings.tsx";

describe("unconnected account settings", () => {
  it("does not claim that an export request was sent", () => {
    render(<AccountSettings role="student" />);

    expect(
      screen.getByRole("button", { name: "Export unavailable" }),
    ).toBeDisabled();
    expect(
      screen.getByText(
        /No request will be sent until the server export service is available/i,
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText("Export requested")).not.toBeInTheDocument();
  });
});

describe("unconnected security settings", () => {
  it("keeps unenforced controls and sign-out disabled", () => {
    render(<SecuritySettings />);

    expect(
      screen.getByText(/Security services are not connected yet/i),
    ).toBeInTheDocument();

    for (const name of [
      "Two-factor authentication",
      "New device alerts",
      "Sign-in alerts",
    ]) {
      const control = screen.getByRole("switch", { name });
      expect(control).toBeDisabled();
      expect(control).toHaveAttribute("aria-checked", "false");
    }

    expect(
      screen.getByRole("button", { name: "Sign out unavailable" }),
    ).toBeDisabled();
    expect(screen.queryByText("Saved automatically")).not.toBeInTheDocument();
  });
});
