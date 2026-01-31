import type { Route } from "./+types/home";
import { useEffect, useRef, useState } from "react";
import { useLoaderData } from "react-router";
import { initServer } from "../lib/init.server";
import { listTiles } from "../lib/tiles.server";
import { getR2PublicUrl, signDownloadUrl } from "../lib/r2.client.server";
import { MasonryGrid } from "../components/MasonryGrid";
import { TileCard } from "../components/TileCard";
import { trackEvent } from "../lib/events.server";
import { getClientIp, getUserAgent } from "../lib/request.server";
import { getUserFromRequest } from "../lib/auth.server";

const USE_SAMPLE_TILES = true;

const SAMPLE_TILES = [
  {
    id: "sample-1",
    title: "Stone Grid",
    url: "https://images.unsplash.com/photo-1469474968028-56623f02e42e?auto=format&fit=crop&w=900&q=80",
  },
  {
    id: "sample-2",
    title: "Warm Clay",
    url: "https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=900&q=80",
  },
  {
    id: "sample-3",
    title: "Palm Lines",
    url: "https://images.unsplash.com/photo-1500534314209-a25ddb2bd429?auto=format&fit=crop&w=900&q=80",
  },
  {
    id: "sample-4",
    title: "Light Geometry",
    url: "https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=900&q=80",
  },
  {
    id: "sample-5",
    title: "Concrete Blue",
    url: "https://images.unsplash.com/photo-1482192596544-9eb780fc7f66?auto=format&fit=crop&w=900&q=80",
  },
  {
    id: "sample-6",
    title: "Night Sky",
    url: "https://images.unsplash.com/photo-1451187580459-43490279c0fa?auto=format&fit=crop&w=900&q=80",
  },
];

export async function loader({ request }: Route.LoaderArgs) {
  await initServer();
  const url = new URL(request.url);
  const q = url.searchParams.get("q") ?? "";
  const tagsParam = url.searchParams.get("tags") ?? "";
  const tags = tagsParam.split(",").map((tag) => tag.trim()).filter(Boolean);
  const page = Number(url.searchParams.get("page") ?? "1");

  if (q || tags.length) {
    const user = await getUserFromRequest(request);
    await trackEvent({
      type: "search",
      userId: user?.id,
      ip: getClientIp(request),
      userAgent: getUserAgent(request),
      meta: { q, tags },
    });
  }

  const limit = 24;
  const { items, total } = await listTiles({
    q,
    tags,
    page,
    limit,
    visibility: ["public"],
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

  return { tiles, q, tags, page, total, limit };
}

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Seamless Tiles — Descubre patrones sin costuras" },
    { name: "description", content: "Explora patrones seamless listos para tus proyectos." },
  ];
}

export default function Home() {
  const { tiles, total, limit, q, tags } = useLoaderData<typeof loader>();
  const showSamples = USE_SAMPLE_TILES && tiles.length === 0;
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
        if (q) params.set("q", q);
        if (tags.length) params.set("tags", tags.join(","));
        params.set("page", String(nextPage));
        params.set("limit", String(limit));
        fetch(`/api/tiles?${params.toString()}`)
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
  }, [hasMore, loadingMore, page, q, tags, limit]);

  return (
    <main className="page">
      <div className="page__inner">
        <MasonryGrid>
          {items.map(({ tile, previewUrl }) => (
            <TileCard key={tile._id} tile={tile} previewUrl={previewUrl} />
          ))}
          {showSamples
            ? SAMPLE_TILES.map((sample) => (
                <div key={sample.id} className="tile-card">
                  <div className="tile-card__image">
                    <img src={sample.url} alt={sample.title} loading="lazy" />
                    <div className="tile-card__overlay">
                      <h3>{sample.title}</h3>
                      <p>Demo preview</p>
                    </div>
                  </div>
                  <div className="tile-card__meta">
                    <h3>{sample.title}</h3>
                    <p>Demo preview</p>
                  </div>
                </div>
              ))
            : null}
        </MasonryGrid>
        {!showSamples && hasMore ? (
          <div ref={sentinelRef} className="py-6 text-center text-sm text-gray-500">
            {loadingMore ? "Cargando más..." : "Cargar más"}
          </div>
        ) : null}
      </div>
    </main>
  );
}
