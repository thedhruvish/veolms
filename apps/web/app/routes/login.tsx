import type { MetaFunction } from "react-router";
import { Link } from "react-router";

import { pageTitle } from "../config/academy.ts";

export const meta: MetaFunction = () => [{ title: pageTitle("Login") }];

export default function Login() {
  return (
    <main className="form-page">
      <section className="form-card" aria-labelledby="login-heading">
        <p className="eyebrow">Account preview</p>
        <h1 id="login-heading" className="heading mt-2 text-3xl font-semibold">
          Login
        </h1>
        <p className="muted mt-3 text-sm">
          Authentication is not implemented yet.
        </p>
        <form
          className="mt-8 space-y-5"
          onSubmit={(event) => event.preventDefault()}
        >
          <label className="field-label">
            Email
            <input
              autoComplete="email"
              className="field-input"
              name="email"
              type="email"
            />
          </label>
          <label className="field-label">
            Password
            <input
              autoComplete="current-password"
              className="field-input"
              name="password"
              type="password"
            />
          </label>
          <button className="disabled-button w-full" disabled type="submit">
            Login not available
          </button>
        </form>
        <p className="muted mt-6 text-sm">
          Need an account?{" "}
          <Link className="text-link" to="/register">
            Register
          </Link>
        </p>
      </section>
    </main>
  );
}
