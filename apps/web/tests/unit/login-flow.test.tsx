import { fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import LoginRoute from "../../src/routes/login.tsx";

vi.mock("../../src/ThemedSelect.tsx", () => ({
  ThemedSelect: ({
    ariaLabel,
    options,
    value,
  }: {
    ariaLabel: string;
    options: readonly (readonly [string, string])[];
    value: string;
  }) => (
    <button type="button" role="combobox" aria-label={ariaLabel}>
      {options.find(([optionValue]) => optionValue === value)?.[1] ?? ariaLabel}
    </button>
  ),
}));

const submitEmail = (address: string) => {
  fireEvent.change(screen.getByLabelText("Email address"), {
    target: { value: address },
  });
  fireEvent.click(screen.getByRole("button", { name: "Continue" }));
};

const submitMobile = (number: string) => {
  fireEvent.click(screen.getByRole("tab", { name: "Mobile" }));
  fireEvent.change(screen.getByLabelText("Mobile number"), {
    target: { value: number },
  });
  fireEvent.click(screen.getByRole("button", { name: "Continue" }));
};

const typeCode = (code: string) => {
  [...code].forEach((digit, index) => {
    fireEvent.change(
      screen.getByLabelText(`Verification code digit ${index + 1} of 6`),
      { target: { value: digit } },
    );
  });
};

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("the login flow", () => {
  it("opens on the identifier step with the social actions in place", () => {
    render(<LoginRoute />);

    expect(
      screen.getByRole("heading", { level: 1, name: "Welcome to ProCodrr" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Email address")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Continue with Google" }),
    ).toBeInTheDocument();
  });

  it("moves to the code step, which echoes the email and drops the social actions", () => {
    render(<LoginRoute />);

    submitEmail("learner@procodrr.com");

    expect(
      screen.getByRole("heading", { level: 1, name: "Verify OTP" }),
    ).toBeInTheDocument();
    expect(screen.getByText("le●●●●●@procodrr.com")).toBeInTheDocument();
    expect(screen.queryByLabelText("Email address")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Continue with Google" }),
    ).not.toBeInTheDocument();
  });

  it("masks the mobile number the code was sent to", () => {
    render(<LoginRoute />);

    submitMobile("9876543210");

    expect(screen.getByText("+91 ●●●●● ●●210")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Change mobile number" }),
    ).toBeInTheDocument();
  });

  it("returns to the identifier step when the learner changes the email", () => {
    render(<LoginRoute />);

    submitEmail("learner@procodrr.com");
    fireEvent.click(screen.getByRole("button", { name: "Change email" }));

    expect(
      screen.getByRole("heading", { level: 1, name: "Welcome to ProCodrr" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Email address")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Continue with Google" }),
    ).toBeInTheDocument();
  });

  it("leaves the primary action ready after six digits, with no server to answer yet", () => {
    render(<LoginRoute />);

    submitEmail("learner@procodrr.com");
    typeCode("140926");
    fireEvent.click(screen.getByRole("button", { name: "Verify & Continue" }));

    expect(
      screen.getByRole("button", { name: "Verify & Continue" }),
    ).toBeEnabled();
    expect(
      screen.queryByRole("button", { name: "Verifying..." }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
