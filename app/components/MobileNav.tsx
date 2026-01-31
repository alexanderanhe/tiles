import { Link, useRouteLoaderData } from "react-router";
import {
  HiHome,
  HiFire,
  HiSparkles,
  HiArrowUpTray,
  HiUserCircle,
} from "react-icons/hi2";
import type { SessionUser } from "../lib/types";

export function MobileNav() {
  const data = useRouteLoaderData("root") as { user: SessionUser | null };
  const user = data?.user;

  return (
    <nav className="mobile-nav">
      <Link to="/" className="mobile-nav__item">
        <HiHome aria-hidden />
        <span>Inicio</span>
      </Link>
      <Link to="/?tags=Trending" className="mobile-nav__item">
        <HiFire aria-hidden />
        <span>Explorar</span>
      </Link>
      <Link to="/generator" className="mobile-nav__item">
        <HiSparkles aria-hidden />
        <span>AI</span>
      </Link>
      {user?.role === "creator" || user?.role === "admin" ? (
        <Link to="/upload" className="mobile-nav__item">
          <HiArrowUpTray aria-hidden />
          <span>Subir</span>
        </Link>
      ) : null}
      <Link to={user ? `/creator/${user.id}` : "/login"} className="mobile-nav__item">
        <HiUserCircle aria-hidden />
        <span>{user ? "Perfil" : "Entrar"}</span>
      </Link>
    </nav>
  );
}
