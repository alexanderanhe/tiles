import { Link, useRouteLoaderData } from "react-router";
import {
  HiHome,
  HiFire,
  HiSparkles,
  HiArrowUpTray,
  HiSquares2X2,
  HiShieldCheck,
} from "react-icons/hi2";
import type { SessionUser } from "../lib/types";

const navItems = [
  { to: "/", label: "Home", icon: HiHome },
  { to: "/?tags=Trending", label: "Trending", icon: HiFire },
  { to: "/generator", label: "Generator", icon: HiSparkles },
  { to: "/upload", label: "Upload", icon: HiArrowUpTray },
  { to: "/my-tiles", label: "Mis tiles", icon: HiSquares2X2 },
  { to: "/admin", label: "Admin", icon: HiShieldCheck },
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
          const Icon = item.icon;
          return (
            <Link key={item.to} to={item.to} className="side-nav__item">
              <Icon aria-hidden />
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
