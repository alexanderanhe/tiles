import { createCookieSessionStorage, redirect } from "react-router";
import { env } from "./env.server";
import type { SessionUser, UserRole } from "./types";

const sessionStorage = createCookieSessionStorage<{ user?: SessionUser }>({
  cookie: {
    name: "st_session",
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secrets: [env.JWT_SECRET],
    secure: env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 7,
  },
});

export async function getSession(request: Request) {
  const cookie = request.headers.get("Cookie");
  return sessionStorage.getSession(cookie);
}

export async function getUserFromRequest(request: Request) {
  const session = await getSession(request);
  return session.get("user") ?? null;
}

export async function requireUser(
  request: Request,
  options?: { api?: boolean }
) {
  const user = await getUserFromRequest(request);
  if (!user) {
    if (options?.api) {
      throw new Response("Unauthorized", { status: 401 });
    }
    throw redirect("/login");
  }
  if (user.status !== "active") {
    if (options?.api) {
      throw new Response("Forbidden", { status: 403 });
    }
    throw redirect("/verify?status=pending");
  }
  return user;
}

export function requireRole(user: SessionUser, role: UserRole | "any_authenticated") {
  if (role === "any_authenticated") return;
  const rank: Record<UserRole, number> = { user: 1, creator: 2, admin: 3 };
  if (rank[user.role] < rank[role]) {
    throw new Response("Forbidden", { status: 403 });
  }
}

export async function commitUserSession(user: SessionUser) {
  const session = await sessionStorage.getSession();
  session.set("user", user);
  return sessionStorage.commitSession(session);
}

export async function destroyUserSession(request: Request) {
  const session = await getSession(request);
  return sessionStorage.destroySession(session);
}

export { sessionStorage };
