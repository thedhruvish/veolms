import { render, screen } from "@testing-library/react";
import React from "react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { describe, expect, it } from "vitest";
import AuthLayout from "../../src/routes/auth-layout.tsx";
import RegisterRoute, {
  clientLoader as registerClientLoader,
} from "../../src/routes/register.tsx";
import {
  AuthBrandMark,
  AuthBrandPanel,
} from "../../src/auth/AuthBrandPanel.tsx";
import LoginRoute, { meta as loginMeta } from "../../src/routes/login.tsx";

describe("login screen", () => {
  it("welcomes new and returning visitors with the same neutral heading", () => {
    render(<LoginRoute />);

    expect(
      screen.getByRole("heading", { level: 1, name: "Welcome to ProCodrr" }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/welcome back/i)).not.toBeInTheDocument();
  });

  it("tells visitors that the single screen both logs in and registers", () => {
    render(<LoginRoute />);

    expect(
      screen.getByText("Log in or create an account to continue."),
    ).toBeInTheDocument();
  });

  it("leaves an empty mount point for the identifier form", () => {
    const { container } = render(<LoginRoute />);

    const formSlot = container.querySelector(".auth-card__form-slot");
    expect(formSlot).not.toBeNull();
    expect(formSlot).toBeEmptyDOMElement();
  });

  it("closes with the academy copyright and tagline", () => {
    render(<LoginRoute />);

    expect(
      screen.getByText("© 2026 ProCodrr. All rights reserved."),
    ).toBeInTheDocument();
    expect(screen.getByText("Learn. Build. Grow.")).toBeInTheDocument();
  });

  it("brands its document metadata like every academy route", () => {
    expect(loginMeta()).toEqual([
      { title: "Log in · ProCodrr" },
      {
        name: "description",
        content:
          "Log in to ProCodrr or create an account with a one-time code.",
      },
    ]);
  });
});

describe("auth layout", () => {
  it("frames the routed screen beside the brand panel", async () => {
    const router = createMemoryRouter(
      [
        {
          Component: AuthLayout,
          children: [{ index: true, element: <p>routed auth screen</p> }],
        },
      ],
      { initialEntries: ["/"] },
    );

    const { container } = render(<RouterProvider router={router} />);

    const routedScreen = await screen.findByText("routed auth screen");
    expect(container.querySelector(".auth-page__form-column")).toContainElement(
      routedScreen,
    );
    expect(container.querySelector(".auth-page__brand-column")).not.toBeNull();
    expect(container.querySelector(".auth-brand-panel")).not.toBeNull();
  });
});

describe("register route", () => {
  it("redirects to the single login entry point", () => {
    const response = registerClientLoader();

    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe("/login");
  });
});

describe("auth routes alongside the academy catch-all", () => {
  const renderAt = (initialEntry: string) => {
    const router = createMemoryRouter(
      [
        {
          id: "academy-layout",
          children: [
            { id: "home", index: true, element: <p>academy home</p> },
            {
              id: "home-fallback",
              path: "*",
              element: <p>academy catch-all</p>,
            },
          ],
        },
        {
          id: "auth-layout",
          Component: AuthLayout,
          children: [
            { id: "login", path: "login", Component: LoginRoute },
            {
              id: "register",
              path: "register",
              loader: registerClientLoader,
              Component: RegisterRoute,
            },
          ],
        },
      ],
      { initialEntries: [initialEntry] },
    );

    return render(<RouterProvider router={router} />);
  };

  it("leaves the root path with the academy layout", async () => {
    renderAt("/");

    expect(await screen.findByText("academy home")).toBeInTheDocument();
    expect(document.querySelector(".auth-page")).toBeNull();
  });

  it("matches /login ahead of the academy catch-all", async () => {
    renderAt("/login");

    expect(
      await screen.findByRole("heading", {
        level: 1,
        name: "Welcome to ProCodrr",
      }),
    ).toBeInTheDocument();
    expect(screen.queryByText("academy catch-all")).not.toBeInTheDocument();
  });

  it("sends /register through to the login screen", async () => {
    renderAt("/register");

    expect(
      await screen.findByRole("heading", {
        level: 1,
        name: "Welcome to ProCodrr",
      }),
    ).toBeInTheDocument();
  });
});

describe("auth brand mark", () => {
  it("inherits the current text colour so it survives every palette", () => {
    const { container } = render(<AuthBrandMark />);

    expect(container.innerHTML).toContain('fill="currentColor"');
    expect(container.innerHTML).not.toContain('fill="black"');
  });
});

describe("auth brand panel", () => {
  it("reserves the illustration area without announcing it to screen readers", () => {
    const { container } = render(<AuthBrandPanel />);

    const illustrationSlot = container.querySelector(
      ".auth-brand-panel__illustration-slot",
    );
    expect(illustrationSlot).not.toBeNull();
    expect(illustrationSlot).toHaveAttribute("aria-hidden", "true");
    expect(illustrationSlot).toBeEmptyDOMElement();
  });
});
