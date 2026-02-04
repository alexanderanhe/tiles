import type { Route } from "./+types/my-tiles";
import { useEffect, useRef, useState } from "react";
import { useLoaderData } from "react-router";
import { initServer } from "../lib/init.server";
import { listTiles } from "../lib/tiles.server";
import { getR2PublicUrl, signDownloadUrl } from "../lib/r2.client.server";
import { MasonryGrid } from "../components/MasonryGrid";
import { TileCard } from "../components/TileCard";
import { requireUser } from "../lib/auth.server";

export async function loader({ request }: Route.LoaderArgs) {
  await initServer();
  const user = await requireUser(request);

  const url = new URL(request.url);
  const page = Number(url.searchParams.get("page") ?? "1");
  const limit = 24;
  const { items, total } = await listTiles({
    page,
    limit,
    ownerId: user.id,
  });

  const tiles = await Promise.all(
    items.map(async (tile) => {
      const previewKey = tile.r2.thumbCleanKey || tile.r2.previewKey || tile.r2.masterKey;
      let previewUrl = "";
      if (previewKey) {
        previewUrl = getR2PublicUrl(previewKey) || (await signDownloadUrl(previewKey));
      }
      return { tile, previewUrl };
    })
  );

  return { tiles, page, total, limit };
}

export function meta() {
  return [{ title: "Mis tiles — Seamless Tiles" }];
}

export default function MyTiles() {
  const { tiles, total, limit } = useLoaderData<typeof loader>();
  const [items, setItems] = useState(tiles);
  const [page, setPage] = useState(1);
  const [loadingMore, setLoadingMore] = useState(false);
  const hasMore = items.length < total;
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setItems(tiles);
    setPage(1);
  }, [tiles]);

  useEffect(() => {
    if (!hasMore || loadingMore) return;
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries[0]?.isIntersecting) return;
        observer.disconnect();
        setLoadingMore(true);
        const nextPage = page + 1;
        const params = new URLSearchParams();
        params.set("page", String(nextPage));
        params.set("limit", String(limit));
        fetch(`/api/tiles/mine?${params.toString()}`)
          .then((res) => res.json())
          .then((data) => {
            if (data?.ok && Array.isArray(data.items)) {
              Promise.all(
                data.items.map(async (tile: any) => {
                  let previewUrl = "";
                  try {
                    const res = await fetch(`/api/tiles/${tile._id}/preview`);
                    const preview = await res.json();
                    previewUrl = preview?.url ?? "";
                  } catch {
                    previewUrl = "";
                  }
                  return { tile, previewUrl };
                })
              ).then((nextItems) => {
                setItems((prev) => [...prev, ...nextItems]);
                setPage(nextPage);
              });
            }
          })
          .finally(() => setLoadingMore(false));
      },
      { rootMargin: "200px" }
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, loadingMore, page, limit]);

  return (
    <main className="page">
      <div className="page__inner">
        <div className="page__header">
          <h1>Mis tiles</h1>
          <p>Tus uploads privados y publicados.</p>
        </div>
        <MasonryGrid>
          {items.map(({ tile, previewUrl }) => (
            <TileCard
              key={tile._id}
              tile={tile}
              previewUrl={previewUrl}
              to={`/tiles/${tile._id}`}
            />
          ))}
        </MasonryGrid>
        {hasMore ? (
          <div ref={sentinelRef} className="py-6 text-center text-sm text-gray-500">
            {loadingMore ? "Cargando más..." : "Cargar más"}
          </div>
        ) : null}
      </div>
    </main>
  );
}
