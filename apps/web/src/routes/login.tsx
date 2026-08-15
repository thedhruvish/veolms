import { AuthBrandMark } from "../auth/AuthBrandPanel";
import { IdentifierForm } from "../auth/IdentifierForm";
import { SocialLoginActions } from "../auth/SocialLoginActions";
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

// Sending the one-time code lands with the integration change; validation is all
// this screen does today.
function requestCode() {}

export default function LoginRoute() {
  return (
    <section aria-labelledby="auth-card-heading" className="auth-card">
      <AuthBrandMark />
      <h1 className="auth-card__heading" id="auth-card-heading">
        Welcome to {productName}
      </h1>
      <p className="auth-card__subheading">
        Log in or create an account to continue.
      </p>

      <div className="auth-card__form-slot">
        <IdentifierForm onSubmit={requestCode} status="idle" />
        <SocialLoginActions />
      </div>
    </section>
  );
}
