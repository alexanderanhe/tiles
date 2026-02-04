import {
  isRouteErrorResponse,
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  useLocation,
  useNavigate,
} from "react-router";
import type { Location } from "react-router";
import { type ReactNode, useEffect, useState } from "react";

import type { Route } from "./+types/root";
import "./app.css";
import { getUserFromRequest } from "./lib/auth.server";
import { initServer } from "./lib/init.server";
import { listTopTags } from "./lib/tiles.server";
import { TopNav } from "./components/TopNav";
import { SideNav } from "./components/SideNav";
import { MobileNav } from "./components/MobileNav";

export const links: Route.LinksFunction = () => [
  { rel: "preconnect", href: "https://fonts.googleapis.com" },
  {
    rel: "preconnect",
    href: "https://fonts.gstatic.com",
    crossOrigin: "anonymous",
  },
  {
    rel: "stylesheet",
    href: "https://fonts.googleapis.com/css2?family=Montserrat:wght@300;400;500;600;700&display=swap",
  },
  { rel: "manifest", href: "/manifest.webmanifest" },
  { rel: "icon", href: "/icon-192.svg", type: "image/svg+xml" },
  { rel: "apple-touch-icon", href: "/icon-192.svg" },
];

export const meta: Route.MetaFunction = () => [
  { name: "theme-color", content: "#ffffff" },
  { property: "og:site_name", content: "Seamless Tiles" },
  { property: "og:type", content: "website" },
  { name: "twitter:card", content: "summary_large_image" },
];

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Meta />
        <Links />
      </head>
      <body className="min-h-screen">
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export async function loader({ request }: Route.LoaderArgs) {
  await initServer();
  const user = await getUserFromRequest(request);
  const topTags = await listTopTags({ limit: 5 }).catch(() => []);
  return { user, topTags };
}

export default function App() {
  const location = useLocation();
  const navigate = useNavigate();
  const state = location.state as { backgroundLocation?: Location } | null;
  const backgroundLocation = state?.backgroundLocation;
  const isModalSource = Boolean(backgroundLocation);
  const currentOutlet = <Outlet />;
  const [frozenOutlet, setFrozenOutlet] = useState<ReactNode>(currentOutlet);
  const path = location.pathname;
  const showTabs = path === "/";
  const isAuthRoute =
    path.startsWith("/login") ||
    path.startsWith("/register") ||
    path.startsWith("/verify");

  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
  }, []);

  useEffect(() => {
    if (!isModalSource) {
      setFrozenOutlet(currentOutlet);
    }
  }, [isModalSource, location.key]);

  if (isAuthRoute) {
    return <Outlet />;
  }

  return (
    <div className="app-shell">
      <TopNav showTabs={showTabs} />
      <SideNav />
      <main className={`app-main${showTabs ? " app-main--with-tabs" : ""}`}>
        {isModalSource ? frozenOutlet : currentOutlet}
      </main>
      <MobileNav />
      {isModalSource ? (
        <div className="modal-overlay">
          <div className="modal-card tile-modal">
            <button className="modal-close" onClick={() => navigate(-1)}>
              ✕
            </button>
            <Outlet />
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  let message = "Oops!";
  let details = "An unexpected error occurred.";
  let stack: string | undefined;

  if (isRouteErrorResponse(error)) {
    message = error.status === 404 ? "404" : "Error";
    details =
      error.status === 404
        ? "The requested page could not be found."
        : error.statusText || details;
  } else if (import.meta.env.DEV && error && error instanceof Error) {
    details = error.message;
    stack = error.stack;
  }

  return (
    <main className="pt-16 p-4 container mx-auto">
      <h1>{message}</h1>
      <p>{details}</p>
      {stack && (
        <pre className="w-full p-4 overflow-x-auto">
          <code>{stack}</code>
        </pre>
      )}
    </main>
  );
}
