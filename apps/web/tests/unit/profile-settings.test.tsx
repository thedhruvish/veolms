import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import React from "react";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { ProfileSettings } from "../../src/settings/ProfileSettings.tsx";

beforeAll(() => {
  Object.defineProperty(HTMLDialogElement.prototype, "showModal", {
    configurable: true,
    value(this: HTMLDialogElement) {
      this.setAttribute("open", "");
    },
  });
  Object.defineProperty(HTMLDialogElement.prototype, "close", {
    configurable: true,
    value(this: HTMLDialogElement) {
      this.removeAttribute("open");
    },
  });
});

describe("ProfileSettings mobile visibility confirmation", () => {
  beforeEach(() => window.localStorage.clear());

  it("requires an explicit acknowledgement before showing the mobile number", async () => {
    render(<ProfileSettings role="student" />);

    const mobileVisibility = screen.getByRole("checkbox", {
      name: "Show mobile number on your public profile",
    });
    expect(mobileVisibility).not.toBeChecked();

    fireEvent.click(mobileVisibility);

    const dialog = await screen.findByRole("dialog", {
      name: "Show your mobile number publicly?",
    });
    const consent = within(dialog).getByRole("checkbox", {
      name: /I understand that anyone can call or message me on WhatsApp/i,
    });
    const confirm = within(dialog).getByRole("button", {
      name: "OK, show publicly",
    });

    expect(mobileVisibility).not.toBeChecked();
    expect(confirm).toBeDisabled();

    fireEvent.click(consent);
    expect(confirm).toBeEnabled();

    fireEvent.click(confirm);

    await waitFor(() => expect(dialog).not.toHaveAttribute("open"));
    expect(mobileVisibility).toBeChecked();
  });

  it("leaves the mobile number private when confirmation is cancelled", async () => {
    render(<ProfileSettings role="student" />);

    const mobileVisibility = screen.getByRole("checkbox", {
      name: "Show mobile number on your public profile",
    });
    fireEvent.click(mobileVisibility);

    const dialog = await screen.findByRole("dialog", {
      name: "Show your mobile number publicly?",
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));

    await waitFor(() => expect(dialog).not.toHaveAttribute("open"));
    expect(mobileVisibility).not.toBeChecked();
  });
});
