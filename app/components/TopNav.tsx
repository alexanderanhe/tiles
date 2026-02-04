import { Form, Link, useLocation, useNavigate, useRouteLoaderData } from "react-router";
import { HiMagnifyingGlass } from "react-icons/hi2";
import type { SessionUser } from "../lib/types";

export function TopNav({ showTabs }: { showTabs?: boolean }) {
  const data = useRouteLoaderData("root") as {
    user: SessionUser | null;
    topTags?: string[];
  };
  const user = data?.user;
  const topTags = data?.topTags ?? [];
  const navigate = useNavigate();
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  const q = params.get("q") ?? "";
  const tagsParam = params.get("tags") ?? "";
  const sort = params.get("sort") ?? "";
  const ai = params.get("ai") ?? "";
  const activeTags = tagsParam.split(",").map((tag) => tag.trim()).filter(Boolean);
  const effectiveSort =
    sort || (activeTags.length === 0 && !q ? "popular" : "");
  const tabs = [
    { label: "Destacados", sort: "popular" },
    ...topTags.map((tag) => ({ label: tag, tags: tag })),
    { label: "Generadas por IA", ai: "only" },
  ];

  return (
    <header className="top-nav">
      <div className="top-nav__inner">
        <Link to="/" className="top-nav__brand">
          Seamless
        </Link>

        <Form method="get" action="/" className="top-nav__search">
          <HiMagnifyingGlass className="top-nav__search-icon" />
          <input
            name="q"
            placeholder="Buscar texturas, colores, conceptos"
            defaultValue={q}
            onChange={(event) => {
              const value = event.target.value;
              if (value.length === 0) {
                const next = new URLSearchParams();
                if (tagsParam) next.set("tags", tagsParam);
                if (sort) next.set("sort", sort);
                if (ai) next.set("ai", ai);
                const query = next.toString();
                navigate(query ? `/?${query}` : "/");
              }
            }}
          />
          {tagsParam ? <input type="hidden" name="tags" value={tagsParam} /> : null}
          {sort ? <input type="hidden" name="sort" value={sort} /> : null}
          {ai ? <input type="hidden" name="ai" value={ai} /> : null}
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
          {tabs.map((tab) => {
            const isFeatured = tab.sort === "popular";
            const isActive = isFeatured
              ? effectiveSort === "popular" && activeTags.length === 0 && !ai
              : tab.ai
                ? ai === tab.ai
                : Boolean(tab.tags && activeTags.includes(tab.tags));
            const linkParams = new URLSearchParams();
            if (q) linkParams.set("q", q);
            if (tab.tags) {
              linkParams.set("tags", tab.tags);
              linkParams.delete("sort");
              linkParams.delete("ai");
            } else if (tab.sort) {
              linkParams.set("sort", tab.sort);
              linkParams.delete("tags");
              linkParams.delete("ai");
            } else if (tab.ai) {
              linkParams.set("ai", tab.ai);
              linkParams.delete("tags");
              linkParams.delete("sort");
            }
            const href = `/?${linkParams.toString()}`;
            return (
              <Link
                key={tab.label}
                to={href}
                className={`top-nav__tab${isActive ? " is-active" : ""}`}
              >
                {tab.label}
              </Link>
            );
          })}
        </div>
      ) : null}
    </header>
  );
}
