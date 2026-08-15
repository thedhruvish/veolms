import { AuthBrandMark } from "../auth/AuthBrandPanel";
import { getAuthRouteMeta, productName } from "../routing/routeDescriptors";

export function meta() {
  return Object.entries(
    getAuthRouteMeta(
      "Log in",
      `Log in to ${productName} or create an account with a one-time code.`,
    ),
  ).map(([name, content]) =>
    name === "title" ? { title: content } : { name, content },
  );
}

export default function LoginRoute() {
  return (
    <>
      <section aria-labelledby="auth-card-heading" className="auth-card">
        <AuthBrandMark />
        <h1 className="auth-card__heading" id="auth-card-heading">
          Welcome to {productName}
        </h1>
        <p className="auth-card__subheading">
          Log in or create an account to continue.
        </p>

        {/* The identifier form mounts here. */}
        <div className="auth-card__form-slot" />
      </section>

      <footer className="auth-page__footer">
        <p>&copy; 2026 {productName}. All rights reserved.</p>
        <p>Learn. Build. Grow.</p>
      </footer>
    </>
  );
}
