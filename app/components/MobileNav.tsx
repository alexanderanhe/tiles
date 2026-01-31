import { Link, useRouteLoaderData } from "react-router";
import type { SessionUser } from "../lib/types";

export function MobileNav() {
  const data = useRouteLoaderData("root") as { user: SessionUser | null };
  const user = data?.user;

  return (
    <nav className="mobile-nav">
      <Link to="/" className="mobile-nav__item">Inicio</Link>
      <Link to="/?tags=Trending" className="mobile-nav__item">Explorar</Link>
      <Link to="/generator" className="mobile-nav__item">AI</Link>
      {user?.role === "creator" || user?.role === "admin" ? (
        <Link to="/upload" className="mobile-nav__item">Subir</Link>
      ) : null}
      <Link to={user ? `/creator/${user.id}` : "/login"} className="mobile-nav__item">
        {user ? "Perfil" : "Entrar"}
      </Link>
    </nav>
  );
}
