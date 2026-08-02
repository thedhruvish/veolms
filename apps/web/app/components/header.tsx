import { Link, NavLink } from "react-router";

import { academy } from "../config/academy.ts";

const navigation = [
  { label: "Home", to: "/" },
  { label: "Courses", to: "/courses" },
  { label: "Login", to: "/login" },
];

export function Header() {
  return (
    <header className="site-header border-b">
      <div className="page-shell flex min-h-16 items-center justify-between gap-6">
        <Link
          className="brand-link text-xl font-semibold tracking-tight"
          to="/"
        >
          {academy.brandName}
        </Link>
        <nav aria-label="Primary" className="flex items-center gap-4 sm:gap-6">
          {navigation.map((item) => (
            <NavLink
              className={({ isActive }) =>
                isActive ? "nav-link nav-link-active" : "nav-link"
              }
              end={item.to === "/"}
              key={item.to}
              to={item.to}
            >
              {item.label}
            </NavLink>
          ))}
          <Link className="primary-link py-2" to="/register">
            Register
          </Link>
        </nav>
      </div>
    </header>
  );
}
