import type { Route } from "./+types/admin";
import { useLoaderData } from "react-router";
import { initServer } from "../lib/init.server";
import { requireUser } from "../lib/auth.server";
import { listUsers } from "../lib/users.server";
import { listTiles } from "../lib/tiles.server";

export async function loader({ request }: Route.LoaderArgs) {
  await initServer();
  const user = await requireUser(request);
  if (user.role !== "admin") {
    throw new Response("Forbidden", { status: 403 });
  }
  const users = await listUsers();
  const tiles = await listTiles({ limit: 50, page: 1 });
  return { users, tiles: tiles.items };
}

export default function Admin() {
  const { users, tiles } = useLoaderData<typeof loader>();

  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-10 px-4 pb-20 pt-10">
      <section className="hero-card">
        <h1 className="text-3xl font-display">Admin dashboard</h1>
        <p className="mt-2 text-sm text-ink/70">
          Manage user roles and tile visibility.
        </p>
      </section>

      <section className="detail-hero">
        <h2 className="text-lg font-semibold">Users</h2>
        <div className="mt-4 grid gap-3">
          {users.map((user) => (
            <div
              key={user._id}
              className="flex flex-col gap-3 rounded-2xl border border-black/10 bg-white/70 p-4 md:flex-row md:items-center md:justify-between"
            >
              <div>
                <p className="text-sm font-semibold">{user.email}</p>
                <p className="text-xs text-ink/60">{user.name ?? ""}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <select
                  defaultValue={user.role}
                  className="input-field text-xs"
                  onChange={async (event) => {
                    await fetch(`/api/admin/users/${user._id}`, {
                      method: "PATCH",
                      headers: { "content-type": "application/json" },
                      body: JSON.stringify({ role: event.target.value }),
                    });
                  }}
                >
                  <option value="user">user</option>
                  <option value="creator">creator</option>
                  <option value="admin">admin</option>
                </select>
                <select
                  defaultValue={user.status}
                  className="input-field text-xs"
                  onChange={async (event) => {
                    await fetch(`/api/admin/users/${user._id}`, {
                      method: "PATCH",
                      headers: { "content-type": "application/json" },
                      body: JSON.stringify({ status: event.target.value }),
                    });
                  }}
                >
                  <option value="pending">pending</option>
                  <option value="active">active</option>
                  <option value="disabled">disabled</option>
                </select>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="detail-hero">
        <h2 className="text-lg font-semibold">Recent tiles</h2>
        <div className="mt-4 grid gap-3">
          {tiles.map((tile) => (
            <div
              key={tile._id}
              className="rounded-2xl border border-black/10 bg-white/70 p-4"
            >
              <p className="text-sm font-semibold">{tile.title}</p>
              <p className="text-xs text-ink/60">{tile.visibility}</p>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
