import type { Route } from "./+types/creator.$id";
import { useLoaderData } from "react-router";
import { useState } from "react";
import { initServer } from "../lib/init.server";
import { findUserById } from "../lib/users.server";
import { listTiles } from "../lib/tiles.server";
import { getR2PublicUrl, signDownloadUrl } from "../lib/r2.client.server";
import { MasonryGrid } from "../components/MasonryGrid";
import { TileCard } from "../components/TileCard";
import { slugify } from "../lib/slug";
import { getUserFromRequest } from "../lib/auth.server";

export async function loader({ params, request }: Route.LoaderArgs) {
  await initServer();
  const user = await findUserById(params.id ?? "");
  if (!user) throw new Response("Not found", { status: 404 });
  const viewer = await getUserFromRequest(request);

  const { items } = await listTiles({
    ownerId: user._id,
    visibility: ["public"],
    limit: 24,
    page: 1,
  });

  const tiles = await Promise.all(
    items.map(async (tile) => {
      const previewKey = tile.r2.previewKey;
      let previewUrl = "";
      if (previewKey) {
        previewUrl = getR2PublicUrl(previewKey) || (await signDownloadUrl(previewKey));
      }
      return { tile, previewUrl };
    })
  );

  const handle = user.username ?? (user.name ? slugify(user.name) : user._id);
  const canEdit = viewer?.id === user._id;
  return { user, tiles, handle, canEdit };
}

export default function CreatorProfile() {
  const { user, tiles, handle, canEdit } = useLoaderData<typeof loader>();
  const [username, setUsername] = useState(user.username ?? "");
  const [status, setStatus] = useState("");

  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-8 px-4 pb-20 pt-10">
      <section className="hero-card">
        <p className="text-xs uppercase tracking-[0.2em] text-ink/60">Creator</p>
        <h1 className="mt-2 text-3xl font-display">{user.name ?? user.email}</h1>
        <p className="mt-2 text-sm text-ink/70">{user.email}</p>
        {canEdit ? (
          <div className="creator-edit">
            <label>
              Username
              <input
                className="input-field"
                type="text"
                placeholder="tu-usuario"
                value={username}
                onChange={(event) => setUsername(event.target.value.toLowerCase())}
              />
            </label>
            <button
              className="btn-primary"
              onClick={async () => {
                setStatus("");
                const res = await fetch("/api/me", {
                  method: "PATCH",
                  headers: { "content-type": "application/json" },
                  body: JSON.stringify({ username }),
                });
                if (!res.ok) {
                  setStatus("No se pudo guardar.");
                  return;
                }
                setStatus("Guardado.");
              }}
            >
              Guardar username
            </button>
            {status ? <p className="creator-edit__status">{status}</p> : null}
          </div>
        ) : null}
      </section>

      <MasonryGrid>
        {tiles.map(({ tile, previewUrl }) => (
          <TileCard
            key={tile._id}
            tile={tile}
            previewUrl={previewUrl}
            ownerHandle={handle}
          />
        ))}
      </MasonryGrid>
    </main>
  );
}
