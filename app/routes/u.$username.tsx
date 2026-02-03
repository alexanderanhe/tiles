import type { Route } from "./+types/u.$username";
import { useLoaderData } from "react-router";
import { initServer } from "../lib/init.server";
import { findUserByEmail, findUserByName } from "../lib/users.server";
import { listTiles } from "../lib/tiles.server";
import { getR2PublicUrl, signDownloadUrl } from "../lib/r2.client.server";
import { MasonryGrid } from "../components/MasonryGrid";
import { TileCard } from "../components/TileCard";

export async function loader({ params }: Route.LoaderArgs) {
  await initServer();
  const username = params.username ?? "";
  const user = username.includes("@")
    ? await findUserByEmail(username)
    : await findUserByName(username);
  if (!user) throw new Response("Not found", { status: 404 });

  const { items } = await listTiles({
    ownerId: user._id,
    visibility: ["public"],
    limit: 24,
    page: 1,
  });

  const tiles = await Promise.all(
    items.map(async (tile) => {
      const previewKey = tile.r2.thumbCleanKey || tile.r2.previewKey;
      let previewUrl = "";
      if (previewKey) {
        previewUrl = getR2PublicUrl(previewKey) || (await signDownloadUrl(previewKey));
      }
      return { tile, previewUrl };
    })
  );

  return { user, tiles };
}

export default function UserProfile() {
  const { user, tiles } = useLoaderData<typeof loader>();

  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-8 px-4 pb-20 pt-10">
      <section className="hero-card">
        <p className="text-xs uppercase tracking-[0.2em] text-ink/60">Profile</p>
        <h1 className="mt-2 text-3xl font-display">{user.name ?? user.email}</h1>
        <p className="mt-2 text-sm text-ink/70">{user.email}</p>
      </section>

      <MasonryGrid>
        {tiles.map(({ tile, previewUrl }) => (
          <TileCard key={tile._id} tile={tile} previewUrl={previewUrl} />
        ))}
      </MasonryGrid>
    </main>
  );
}
