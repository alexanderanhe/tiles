import { Link, useRouteLoaderData } from "react-router";
import type { SessionUser } from "../lib/types";

const navItems = [
  { to: "/", label: "Home", icon: "M3 3h8v8H3z" },
  { to: "/?tags=Trending", label: "Trending", icon: "M3 3h8v2H3z" },
  { to: "/generator", label: "Generator", icon: "M2 2h10v10H2z" },
  { to: "/upload", label: "Upload", icon: "M2 9h10v2H2z" },
  { to: "/my-tiles", label: "Mis tiles", icon: "M2 3h10v8H2z" },
  { to: "/admin", label: "Admin", icon: "M6 2l4 4-4 4-4-4z" },
];

export function SideNav() {
  const data = useRouteLoaderData("root") as { user: SessionUser | null };
  const user = data?.user;
  const initials = user?.name
    ? user.name
        .split(" ")
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part[0]?.toUpperCase())
        .join("")
    : user?.email?.slice(0, 2).toUpperCase();

  return (
    <aside className="side-nav">
      <div className="side-nav__logo">ST</div>
      <nav className="side-nav__links">
        {navItems.map((item) => {
          if (item.to === "/admin" && user?.role !== "admin") return null;
          if (item.to === "/upload" && !user) {
            return null;
          }
          if (item.to === "/my-tiles" && !user) {
            return null;
          }
          return (
            <Link key={item.to} to={item.to} className="side-nav__item">
              <svg viewBox="0 0 14 14" aria-hidden>
                <path d={item.icon} />
              </svg>
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>
      <div className="side-nav__footer">
        {user ? (
          <details className="side-nav__user" data-user-menu>
            <summary className="side-nav__avatar">{initials ?? "U"}</summary>
            <div className="side-nav__menu">
              <div className="side-nav__menu-title">{user.name ?? user.email}</div>
              <Link to={`/creator/${user.id}`}>Perfil</Link>
              <Link to="/my-tiles">Mis tiles</Link>
              <Link to="/generator">Generator</Link>
              <button
                onClick={async () => {
                  await fetch("/api/auth/logout", { method: "POST" });
                  window.location.href = "/";
                }}
              >
                Salir
              </button>
            </div>
          </details>
        ) : null}
      </div>
    </aside>
  );
}
