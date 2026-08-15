import { fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import { describe, expect, it, vi } from "vitest";
import { IdentifierForm } from "../../src/auth/IdentifierForm.tsx";
import type { IdentifierFormProps } from "../../src/auth/IdentifierForm.tsx";
import { SocialLoginActions } from "../../src/auth/SocialLoginActions.tsx";
import {
  GitHubBrandIcon,
  GoogleBrandIcon,
} from "../../src/auth/SocialBrandIcons.tsx";

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

const renderForm = (props: Partial<IdentifierFormProps> = {}) => {
  const onSubmit = vi.fn();
  const view = render(
    <IdentifierForm status="idle" onSubmit={onSubmit} {...props} />,
  );

  return { ...view, onSubmit };
};

describe("identifier method switch", () => {
  it("labels the switch and says what submitting the identifier will do", () => {
    renderForm();

    expect(screen.getByText("Continue with")).toBeInTheDocument();
    expect(
      screen.getByText("We'll send you a one-time code"),
    ).toBeInTheDocument();
  });

  it("starts on email so the field asks for an email address", () => {
    renderForm();

    expect(screen.getByRole("tab", { name: "Email" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByLabelText("Email address")).toHaveAttribute(
      "placeholder",
      "you@example.com",
    );
  });

  it("names each field so password managers and keyboards recognise it", () => {
    renderForm();

    expect(screen.getByLabelText("Email address")).toHaveAttribute(
      "autocomplete",
      "email",
    );

    fireEvent.click(screen.getByRole("tab", { name: "Mobile" }));

    expect(screen.getByLabelText("Mobile number")).toHaveAttribute(
      "autocomplete",
      "tel-national",
    );
  });

  it("swaps the field and its label when mobile is chosen", () => {
    renderForm();

    fireEvent.click(screen.getByRole("tab", { name: "Mobile" }));

    expect(screen.getByLabelText("Mobile number")).toHaveAttribute(
      "placeholder",
      "98XXXXXXXX",
    );
    expect(screen.queryByLabelText("Email address")).not.toBeInTheDocument();
  });

  it("walks the tabs with the arrow keys and selects on focus", () => {
    renderForm();

    fireEvent.keyDown(screen.getByRole("tab", { name: "Email" }), {
      key: "ArrowRight",
    });
    expect(screen.getByLabelText("Mobile number")).toBeInTheDocument();

    fireEvent.keyDown(screen.getByRole("tab", { name: "Mobile" }), {
      key: "ArrowLeft",
    });
    expect(screen.getByLabelText("Email address")).toBeInTheDocument();
  });

  it("gives each method a decorative glyph that leaves its name alone", () => {
    renderForm();

    for (const name of ["Email", "Mobile"]) {
      const glyph = screen.getByRole("tab", { name }).querySelector("svg");
      expect(glyph).not.toBeNull();
      expect(glyph).toHaveAttribute("aria-hidden", "true");
    }
  });

  it("keeps aria-selected and the tab stop on the chosen method", () => {
    renderForm();

    fireEvent.click(screen.getByRole("tab", { name: "Mobile" }));

    const emailTab = screen.getByRole("tab", { name: "Email" });
    const mobileTab = screen.getByRole("tab", { name: "Mobile" });
    expect(emailTab).toHaveAttribute("aria-selected", "false");
    expect(emailTab).toHaveAttribute("tabindex", "-1");
    expect(mobileTab).toHaveAttribute("aria-selected", "true");
    expect(mobileTab).toHaveAttribute("tabindex", "0");
  });
});

describe("email validation", () => {
  it("rejects an empty address on submit", () => {
    renderForm();

    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    expect(
      screen.getByText("Please enter a valid email address."),
    ).toBeInTheDocument();
  });

  it("rejects a value that is not an address", () => {
    renderForm();

    fireEvent.change(screen.getByLabelText("Email address"), {
      target: { value: "not-an-email" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    expect(
      screen.getByText("Please enter a valid email address."),
    ).toBeInTheDocument();
  });

  it("hands a normalised address to the caller", () => {
    const { onSubmit } = renderForm();

    fireEvent.change(screen.getByLabelText("Email address"), {
      target: { value: "  Learner@ProCodrr.com  " },
    });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    expect(onSubmit).toHaveBeenCalledWith({
      method: "email",
      email: "learner@procodrr.com",
    });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});

describe("error reporting", () => {
  it("announces the message and marks the field invalid", () => {
    renderForm();

    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    const field = screen.getByLabelText("Email address");
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("Please enter a valid email address.");
    expect(field).toHaveAttribute("aria-invalid", "true");
    expect(field).toHaveAttribute("aria-describedby", alert.id);
  });

  it("shows a message the caller supplies, such as a failed send", () => {
    const failure = "We couldn't send the verification code. Please try again.";
    renderForm({ errorMessage: failure });

    expect(screen.getByRole("alert")).toHaveTextContent(failure);
    expect(screen.getByLabelText("Email address")).toHaveAttribute(
      "aria-invalid",
      "true",
    );
  });

  it("drops the previous message when the method changes", () => {
    renderForm();

    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    fireEvent.click(screen.getByRole("tab", { name: "Mobile" }));

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Mobile number")).toHaveAttribute(
      "aria-invalid",
      "false",
    );
  });

  it("re-checks the field when it loses focus", () => {
    renderForm();

    const field = screen.getByLabelText("Email address");
    fireEvent.change(field, { target: { value: "not-an-email" } });
    fireEvent.blur(field);

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Please enter a valid email address.",
    );
  });
});

describe("sending state", () => {
  it("locks the primary action while a code is on its way", () => {
    renderForm({ status: "sending" });

    const submit = screen.getByRole("button", { name: "Continue" });
    expect(submit).toBeDisabled();
    expect(submit).toHaveAttribute("aria-busy", "true");
  });
});

describe("mobile validation", () => {
  const submitMobile = (value: string) => {
    const view = renderForm();

    fireEvent.click(screen.getByRole("tab", { name: "Mobile" }));
    fireEvent.change(screen.getByLabelText("Mobile number"), {
      target: { value },
    });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    return view;
  };

  it("keeps the country trigger down to the dial code it contributes", () => {
    renderForm();

    fireEvent.click(screen.getByRole("tab", { name: "Mobile" }));

    expect(
      screen.getByRole("combobox", { name: "Country code" }),
    ).toHaveTextContent(/^\+91$/);
  });

  it("rejects a number that is one digit short", () => {
    submitMobile("987654321");

    expect(
      screen.getByText("Please enter a valid 10-digit mobile number."),
    ).toBeInTheDocument();
  });

  it("rejects a number outside India's mobile range", () => {
    submitMobile("5876543210");

    expect(
      screen.getByText("Please enter a valid 10-digit mobile number."),
    ).toBeInTheDocument();
  });

  it("hands a valid number to the caller in international form", () => {
    const { onSubmit } = submitMobile("098765 43210");

    expect(onSubmit).toHaveBeenCalledWith({
      method: "mobile",
      phoneNo: "+919876543210",
    });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});

describe("social login actions", () => {
  it("offers Google ahead of GitHub under an 'OR' divider", () => {
    render(<SocialLoginActions />);

    const labels = screen
      .getAllByRole("button")
      .map((button) => button.textContent);
    expect(labels).toEqual(["Continue with Google", "Continue with GitHub"]);
    expect(screen.getByText("OR")).toBeInTheDocument();
  });

  it("carries the real brand marks rather than monochrome glyphs", () => {
    render(<SocialLoginActions />);

    const [google, github] = screen.getAllByRole("button");
    expect(google?.querySelector('path[fill="#FFC107"]')).not.toBeNull();
    expect(github?.querySelector('svg[fill="currentColor"]')).not.toBeNull();
  });
});

describe("social brand icons", () => {
  it("keeps Google's four brand colours so the mark survives every palette", () => {
    const { container } = render(<GoogleBrandIcon />);

    expect(container.querySelector("svg")).toHaveAttribute(
      "aria-hidden",
      "true",
    );
    expect(
      [...container.querySelectorAll("path")].map((path) =>
        path.getAttribute("fill"),
      ),
    ).toEqual(["#FFC107", "#FF3D00", "#4CAF50", "#1976D2"]);
  });

  it("paints GitHub with the button's own text colour", () => {
    const { container } = render(<GitHubBrandIcon />);
    const svg = container.querySelector("svg");

    expect(svg).toHaveAttribute("aria-hidden", "true");
    expect(svg).toHaveAttribute("fill", "currentColor");
  });

  it("defaults to the 18px the social row asks every icon for", () => {
    const { container } = render(<GoogleBrandIcon />);
    const svg = container.querySelector("svg");

    expect(svg).toHaveAttribute("width", "18");
    expect(svg).toHaveAttribute("height", "18");
  });

  it("sizes both marks from one numeric prop, like the Phosphor icons here", () => {
    const { container } = render(
      <>
        <GoogleBrandIcon size={24} />
        <GitHubBrandIcon size={24} />
      </>,
    );

    const sizes = [...container.querySelectorAll("svg")].map((svg) => [
      svg.getAttribute("width"),
      svg.getAttribute("height"),
    ]);
    expect(sizes).toEqual([
      ["24", "24"],
      ["24", "24"],
    ]);
  });
});
