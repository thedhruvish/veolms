import { fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { describe, expect, it } from "vitest";
import AuthLayout from "../../src/routes/auth-layout.tsx";
import { academyThemes, getInitialAcademyTheme } from "../../src/themes.ts";
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

  it("mounts the identifier form and the social actions in the card", () => {
    render(<LoginRoute />);

    expect(screen.getByRole("tab", { name: "Email" })).toBeInTheDocument();
    expect(screen.getByLabelText("Email address")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Continue with Google" }),
    ).toBeInTheDocument();
  });

  it("keeps account creation on this page rather than offering a register link", () => {
    render(<LoginRoute />);

    expect(screen.queryByText(/register/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/no account found/i)).not.toBeInTheDocument();
  });

  it("leaves the copyright to the page footer rather than the card", () => {
    const { container } = render(<LoginRoute />);

    expect(container.querySelector(".auth-page__footer")).toBeNull();
    expect(
      screen.queryByText("© 2026 ProCodrr. All rights reserved."),
    ).not.toBeInTheDocument();
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
  const renderLayout = () => {
    const router = createMemoryRouter(
      [
        {
          Component: AuthLayout,
          children: [{ index: true, element: <p>routed auth screen</p> }],
        },
      ],
      { initialEntries: ["/"] },
    );

    return render(<RouterProvider router={router} />);
  };

  it("frames the routed screen beside the brand panel", async () => {
    const { container } = renderLayout();

    const routedScreen = await screen.findByText("routed auth screen");
    expect(container.querySelector(".auth-page__form-column")).toContainElement(
      routedScreen,
    );
    expect(container.querySelector(".auth-page__brand-column")).not.toBeNull();
    expect(container.querySelector(".auth-brand-panel")).not.toBeNull();
  });

  it("holds both columns inside one container", async () => {
    const { container } = renderLayout();

    await screen.findByText("routed auth screen");
    const shared = container.querySelector(".auth-page__container");
    expect(shared).not.toBeNull();
    expect(shared).toContainElement(
      container.querySelector(".auth-page__form-column"),
    );
    expect(shared).toContainElement(
      container.querySelector(".auth-page__brand-column"),
    );
  });

  it("closes the page with the academy copyright and the tagline", async () => {
    const { container } = renderLayout();

    await screen.findByText("routed auth screen");
    const footer = container.querySelector(".auth-page__footer");
    expect(footer).not.toBeNull();
    expect(footer).toHaveTextContent("© 2026 ProCodrr. All rights reserved.");
    expect(footer).toHaveTextContent("Learn. Build. Grow.");
  });
});

describe("auth appearance switcher", () => {
  const renderSwitcher = async () => {
    const router = createMemoryRouter(
      [
        {
          Component: AuthLayout,
          children: [{ index: true, element: <p>routed auth screen</p> }],
        },
      ],
      { initialEntries: ["/"] },
    );
    const view = render(<RouterProvider router={router} />);

    await screen.findByText("routed auth screen");
    return {
      ...view,
      paletteTrigger: screen.getByRole("button", {
        name: "Choose color theme",
      }),
    };
  };

  it("parks a palette chooser and a light/dark toggle in the page corner", async () => {
    const { container, paletteTrigger } = await renderSwitcher();

    expect(container.querySelector(".auth-appearance")).toContainElement(
      paletteTrigger,
    );
    expect(paletteTrigger).toHaveAttribute("type", "button");
    expect(paletteTrigger).toHaveAttribute("aria-expanded", "false");
    expect(paletteTrigger).toHaveAttribute(
      "aria-controls",
      "auth-palette-menu",
    );
    expect(
      screen.getByRole("button", { name: "Switch to light mode" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("opens every academy palette so each one can be tried on this screen", async () => {
    const { paletteTrigger } = await renderSwitcher();

    fireEvent.click(paletteTrigger);

    expect(screen.getByRole("menu")).toHaveAttribute("id", "auth-palette-menu");
    expect(screen.getAllByRole("menuitemradio")).toHaveLength(
      academyThemes.length,
    );
    expect(paletteTrigger).toHaveAttribute("aria-expanded", "true");
  });

  it("persists a chosen palette the way the academy shell reads it back", async () => {
    const { paletteTrigger } = await renderSwitcher();

    fireEvent.click(paletteTrigger);
    fireEvent.click(
      screen.getByRole("menuitemradio", { name: /Graphite Studio/ }),
    );

    expect(document.documentElement.dataset.palette).toBe("graphite");
    expect(getInitialAcademyTheme()).toBe("graphite");
  });

  it("returns focus to the trigger when Escape closes the palette menu", async () => {
    const { paletteTrigger } = await renderSwitcher();

    fireEvent.click(paletteTrigger);
    fireEvent.keyDown(screen.getByRole("menu"), { key: "Escape" });

    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(paletteTrigger).toHaveFocus();
  });

  it("stores light and dark under the preference key the shell shares", async () => {
    await renderSwitcher();

    fireEvent.click(
      screen.getByRole("button", { name: "Switch to light mode" }),
    );

    expect(document.documentElement.dataset.theme).toBe("light");
    expect(window.localStorage.getItem("veolms-theme")).toBe("light");
    expect(
      screen.getByRole("button", { name: "Switch to dark mode" }),
    ).toBeInTheDocument();
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
  it("is the illustration area alone, with no marketing copy of its own", () => {
    const { container } = render(<AuthBrandPanel />);

    expect(screen.queryByRole("heading")).not.toBeInTheDocument();
    expect(screen.queryAllByRole("listitem")).toHaveLength(0);
    expect(screen.queryByText(/all rights reserved/i)).not.toBeInTheDocument();
    expect(container).not.toHaveTextContent(/\S/);
  });

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
