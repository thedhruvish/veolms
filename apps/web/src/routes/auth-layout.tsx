import { Outlet } from "react-router";
import { AuthBrandPanel } from "../auth/AuthBrandPanel";

export default function AuthLayout() {
  return (
    <div className="auth-page">
      <div className="auth-page__form-column">
        <Outlet />
      </div>

      <div className="auth-page__brand-column">
        <AuthBrandPanel />
      </div>
    </div>
  );
}
