import type { MetaFunction } from "react-router";
import { Link } from "react-router";

import { pageTitle } from "../config/academy.ts";

export const meta: MetaFunction = () => [{ title: pageTitle("Register") }];

export default function Register() {
  return (
    <main className="form-page">
      <section className="form-card" aria-labelledby="register-heading">
        <p className="eyebrow">Account preview</p>
        <h1
          id="register-heading"
          className="heading mt-2 text-3xl font-semibold"
        >
          Create account
        </h1>
        <p className="muted mt-3 text-sm">
          Registration is not implemented yet.
        </p>
        <form
          className="mt-8 space-y-5"
          onSubmit={(event) => event.preventDefault()}
        >
          <label className="field-label">
            Name
            <input
              autoComplete="name"
              className="field-input"
              name="name"
              type="text"
            />
          </label>
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
              autoComplete="new-password"
              className="field-input"
              name="password"
              type="password"
            />
          </label>
          <button className="disabled-button w-full" disabled type="submit">
            Account creation not available
          </button>
        </form>
        <p className="muted mt-6 text-sm">
          Already registered?{" "}
          <Link className="text-link" to="/login">
            Login
          </Link>
        </p>
      </section>
    </main>
  );
}
