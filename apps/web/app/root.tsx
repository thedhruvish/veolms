import type { ReactNode } from "react";
import {
  isRouteErrorResponse,
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
} from "react-router";

import { Header } from "./components/header.tsx";
import "./app.css";

export function Layout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Meta />
        <Links />
      </head>
      <body>
        <Header />
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export default function App() {
  return <Outlet />;
}

export function ErrorBoundary({ error }: { error: unknown }) {
  const notFound = isRouteErrorResponse(error) && error.status === 404;

  return (
    <main className="page-shell py-16">
      <p className="eyebrow">{notFound ? "404" : "Error"}</p>
      <h1>{notFound ? "Page not found" : "Something went wrong"}</h1>
      <p className="muted mt-4">
        {notFound
          ? "The page or course you requested could not be found."
          : "Please try again in a moment."}
      </p>
    </main>
  );
}
