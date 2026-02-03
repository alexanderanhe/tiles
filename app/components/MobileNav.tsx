import { Link, useRouteLoaderData } from "react-router";
import {
  HiHome,
  HiFire,
  HiSparkles,
  HiArrowUpTray,
  HiUserCircle,
  HiArrowLeftOnRectangle,
  HiSquares2X2,
} from "react-icons/hi2";
import type { SessionUser } from "../lib/types";

export function MobileNav() {
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
    <nav className="mobile-nav">
      <Link to="/" className="mobile-nav__item">
        <HiHome aria-hidden />
        <span>Home</span>
      </Link>
      <Link to="/?tags=Trending" className="mobile-nav__item">
        <HiFire aria-hidden />
        <span>Trending</span>
      </Link>
      <Link to="/generator" className="mobile-nav__item">
        <HiSparkles aria-hidden />
        <span>Generator</span>
      </Link>
      {user?.role === "creator" || user?.role === "admin" ? (
        <Link to="/upload" className="mobile-nav__item">
          <HiArrowUpTray aria-hidden />
          <span>Upload</span>
        </Link>
      ) : null}
      <details className="mobile-user-menu" data-user-menu>
        <summary className="mobile-user-menu__trigger" aria-label="Menú de usuario">
          {user ? (
            <span className="mobile-user-menu__avatar">{initials ?? "U"}</span>
          ) : (
            <HiUserCircle aria-hidden />
          )}
          <span>{user ? "Menú" : "Entrar"}</span>
        </summary>
        <div className="mobile-user-menu__panel">
          {user ? (
            <>
              <Link to="/my-tiles" className="mobile-user-menu__item">
                <HiSquares2X2 aria-hidden />
                <span>Mis tiles</span>
              </Link>
              <Link to={`/creator/${user.id}`} className="mobile-user-menu__item">
                <HiUserCircle aria-hidden />
                <span>Perfil</span>
              </Link>
              <button
                type="button"
                className="mobile-user-menu__item mobile-user-menu__button"
                onClick={async () => {
                  await fetch("/api/auth/logout", { method: "POST" });
                  window.location.href = "/";
                }}
              >
                <HiArrowLeftOnRectangle aria-hidden />
                <span>Salir</span>
              </button>
            </>
          ) : (
            <Link to="/login" className="mobile-user-menu__item">
              <HiUserCircle aria-hidden />
              <span>Entrar</span>
            </Link>
          )}
        </div>
      </details>
    </nav>
  );
}
