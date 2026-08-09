import "@fontsource-variable/manrope";
import type { ReactNode } from "react";
import { Links, Meta, Outlet, Scripts } from "react-router";
import "./styles.css";
import "./shell-theme.css";

interface LayoutProps {
  children: ReactNode;
}

export function Layout({ children }: LayoutProps) {
  return (
    <html lang="en" data-theme="dark" data-palette="graphite">
      <head>
        <meta charSet="UTF-8" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1.0, viewport-fit=cover"
        />
        <meta name="theme-color" content="#151718" />
        <Meta />
        <Links />
      </head>
      <body>
        <div id="root">{children}</div>
        <Scripts />
      </body>
    </html>
  );
}

export const meta = () => [
  { title: "UI/UX Design Mastery \u00B7 VeoLMS" },
  {
    name: "description",
    content: "VeoLMS focused learning workspace prototype",
  },
];

export function HydrateFallback() {
  return null;
}

export default function Root() {
  return <Outlet />;
}
