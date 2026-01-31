import { Form, Link, useNavigate, useRouteLoaderData } from "react-router";
import type { SessionUser } from "../lib/types";

export function TopNav({ showTabs }: { showTabs?: boolean }) {
  const data = useRouteLoaderData("root") as { user: SessionUser | null };
  const user = data?.user;
  const navigate = useNavigate();

  return (
    <header className="top-nav">
      <div className="top-nav__inner">
        <Link to="/" className="top-nav__brand">
          Seamless
        </Link>

        <Form method="get" action="/" className="top-nav__search">
          <span className="top-nav__search-icon">⌕</span>
          <input
            name="q"
            placeholder="Buscar texturas, colores, conceptos"
            onChange={(event) => {
              const value = event.target.value;
              if (value.length === 0) navigate("/");
            }}
          />
        </Form>

        <nav className="top-nav__actions">
          {user ? (
            <Link className="btn-pill primary" to="/upload">
              Subir imagen
            </Link>
          ) : (
            <Link to="/login" className="btn-pill ghost">
              Entrar
            </Link>
          )}
        </nav>
      </div>
      {showTabs ? (
        <div className="top-nav__tabs">
          <span className="top-nav__tab is-active">Destacados</span>
          <span className="top-nav__tab">Wallpapers</span>
          <span className="top-nav__tab">Renders 3D</span>
          <span className="top-nav__tab">Texturas</span>
          <span className="top-nav__tab">Naturaleza</span>
        </div>
      ) : null}
    </header>
  );
}
