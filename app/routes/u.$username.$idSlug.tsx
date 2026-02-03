import type { Route } from "./+types/u.$username.$idSlug";
import { useLoaderData, useLocation, useNavigate } from "react-router";
import type { Location } from "react-router";
import { useState } from "react";
import {
  HiArrowDownTray,
  HiPencilSquare,
  HiLink,
  HiEllipsisVertical,
  HiTrash,
  HiArrowsPointingOut,
} from "react-icons/hi2";
import { initServer } from "../lib/init.server";
import { findUserByHandle } from "../lib/users.server";
import { findTileById, incrementTileStats, listTiles } from "../lib/tiles.server";
import { getR2PublicUrl, signDownloadUrl } from "../lib/r2.client.server";
import { getUserFromRequest } from "../lib/auth.server";
import { env } from "../lib/env.server";
import { trackEvent } from "../lib/events.server";
import { getClientIp, getUserAgent } from "../lib/request.server";
import { TagChips } from "../components/TagChips";
import { MasonryGrid } from "../components/MasonryGrid";
import { TileCard } from "../components/TileCard";
import { extractIdFromSlug, slugify } from "../lib/slug";

export async function loader({ request, params }: Route.LoaderArgs) {
  await initServer();
  const handle = params.username ?? "";
  const user = await findUserByHandle(handle);
  if (!user) throw new Response("Not found", { status: 404 });

  const tileId = extractIdFromSlug(params.idSlug ?? "");
  const tile = await findTileById(tileId);
  if (!tile || tile.ownerId !== user._id) {
    throw new Response("Not found", { status: 404 });
  }

  const viewer = await getUserFromRequest(request);
  const isOwner = viewer && (viewer.id === tile.ownerId || viewer.role === "admin");
  if (tile.visibility === "private" && !isOwner) {
    throw new Response("Not found", { status: 404 });
  }

  const canonicalHandle = user.username ?? user._id;
  const slug = slugify(tile.title ?? "");
  const canonical = `/u/${canonicalHandle}/${tile._id}${slug ? `-${slug}` : ""}`;
  if (params.username !== canonicalHandle || params.idSlug !== `${tile._id}${slug ? `-${slug}` : ""}`) {
    throw new Response("", {
      status: 302,
      headers: { Location: canonical },
    });
  }

  await trackEvent({
    type: "view",
    userId: viewer?.id,
    tileId: tile._id,
    ip: getClientIp(request),
    userAgent: getUserAgent(request),
  });
  await incrementTileStats(tile._id, "views");

  const previewKey = tile.r2.previewKey;
  const previewUrl = previewKey
    ? getR2PublicUrl(previewKey) || (await signDownloadUrl(previewKey))
    : "";
  const displayUrl =
    viewer && tile.r2.masterKey
      ? await signDownloadUrl(tile.r2.masterKey)
      : previewUrl;

  const relatedResult = await listTiles({
    ownerId: user._id,
    visibility: ["public"],
    limit: 9,
    page: 1,
  });
  const related = await Promise.all(
    relatedResult.items
      .filter((item) => item._id !== tile._id)
      .map(async (item) => {
        const key = item.r2.thumbCleanKey || item.r2.previewKey;
        let url = "";
        if (key) {
          url = getR2PublicUrl(key) || (await signDownloadUrl(key));
        }
        return { tile: item, previewUrl: url };
      })
  );

  const canDownload = Boolean(
    viewer &&
      (tile.visibility !== "private" || isOwner) &&
      (env.DOWNLOAD_REQUIRE_ROLE === "any_authenticated" ||
        viewer.role === env.DOWNLOAD_REQUIRE_ROLE ||
        viewer.role === "admin")
  );

  const origin = env.APP_BASE_URL?.replace(/\/$/, "") || new URL(request.url).origin;
  const canonicalUrl = `${origin}${canonical}`;
  return {
    tile,
    previewUrl,
    displayUrl,
    user,
    related,
    canDownload,
    isOwner,
    handle: canonicalHandle,
    canonicalUrl,
  };
}

export function meta({ data }: Route.MetaArgs) {
  const title = data?.tile?.title ?? "Tile";
  const description =
    data?.tile?.description ?? "Seamless tile available for preview and download.";
  return [
    { title: `${title} — Seamless Tiles` },
    { name: "description", content: description },
    { property: "og:title", content: `${title} — Seamless Tiles` },
    { property: "og:description", content: description },
    ...(data?.previewUrl ? [{ property: "og:image", content: data.previewUrl }] : []),
    { name: "twitter:title", content: `${title} — Seamless Tiles` },
    { name: "twitter:description", content: description },
    ...(data?.previewUrl ? [{ name: "twitter:image", content: data.previewUrl }] : []),
    ...(data?.canonicalUrl ? [{ tagName: "link", rel: "canonical", href: data.canonicalUrl }] : []),
  ];
}

export default function UserTileDetail() {
  const { tile, previewUrl, displayUrl, user, related, canDownload, isOwner, handle } =
    useLoaderData<typeof loader>();
  const navigate = useNavigate();
  const location = useLocation();
  const [tilePreviewOpen, setTilePreviewOpen] = useState(false);
  const [downloadOpen, setDownloadOpen] = useState(false);
  const [downloadLoading, setDownloadLoading] = useState(false);
  const initials = (user.name ?? user.email ?? "")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
  const hasBackground = Boolean(
    (location.state as { backgroundLocation?: Location })?.backgroundLocation
  );

  const content = (
    <div className="tile-page">
      <div className="tile-page__header">
        <div className="tile-page__author">
          <div className="tile-page__avatar">
            {initials || "U"}
          </div>
          <div>
            <p className="tile-page__name">{user.name ?? user.username ?? user.email}</p>
            <p className="tile-page__handle">@{handle}</p>
          </div>
        </div>
        <div className="tile-page__actions">
          {previewUrl ? (
            <button
              className="btn-pill ghost"
              onClick={() => setTilePreviewOpen(true)}
              aria-label="Ver tile infinito"
              title="Ver tile infinito"
            >
              <HiArrowsPointingOut aria-hidden />
            </button>
          ) : null}
          <button
            className="btn-pill primary"
            onClick={() => {
              if (!canDownload) {
                const redirect = encodeURIComponent(
                  `${location.pathname}${location.search}`
                );
                navigate(`/login?redirect=${redirect}`);
                return;
              }
              setDownloadOpen(true);
            }}
            aria-label="Descargar"
            title="Descargar"
          >
            <HiArrowDownTray aria-hidden />
          </button>
          <details className="tile-actions-menu">
            <summary className="btn-pill ghost" aria-label="Mas acciones" title="Mas acciones">
              <HiEllipsisVertical aria-hidden />
            </summary>
            <div className="tile-actions-menu__panel">
              <button
                onClick={() => navigator.clipboard.writeText(window.location.href)}
              >
                <HiLink aria-hidden />
                Copiar enlace
              </button>
              {isOwner ? (
                <>
                  <button onClick={() => navigate(`/tiles/${tile._id}`)}>
                    <HiPencilSquare aria-hidden />
                    Editar
                  </button>
                  <button
                    className="danger"
                    onClick={async () => {
                      const confirmed = window.confirm("Eliminar este tile?");
                      if (!confirmed) return;
                      const res = await fetch(`/api/tiles/${tile._id}`, {
                        method: "DELETE",
                      });
                      if (!res.ok) return;
                      navigate("/my-tiles");
                    }}
                  >
                    <HiTrash aria-hidden />
                    Eliminar
                  </button>
                </>
              ) : null}
            </div>
          </details>
        </div>
      </div>

      <div className="tile-page__content">
        <div className="tile-page__image">
          {displayUrl ? (
            <img src={displayUrl} alt={tile.title} />
          ) : (
            <div className="tile-card__placeholder">Processing...</div>
          )}
        </div>

        <aside className="tile-page__meta">
          <h1>{tile.title}</h1>
          {tile.description ? <p className="tile-page__desc">{tile.description}</p> : null}
          <div className="tile-page__stats">
            <div>
              <span>Visualizaciones</span>
              <strong>{tile.stats?.views ?? 0}</strong>
            </div>
            <div>
              <span>Descargas</span>
              <strong>{tile.stats?.downloads ?? 0}</strong>
            </div>
            <div>
              <span>Formato</span>
              <strong>{tile.format ?? "original"}</strong>
            </div>
          </div>
          <div className="tile-page__tags">
            <TagChips tags={tile.tags} />
          </div>
        </aside>
      </div>

      {related.length ? (
        <section className="tile-page__related">
          <h2>Mas de {user.name ?? user.username ?? "este creador"}</h2>
          <MasonryGrid>
            {related.map(({ tile: rel, previewUrl: url }) => (
              <TileCard
                key={rel._id}
                tile={rel}
                previewUrl={url}
                ownerHandle={handle}
              />
            ))}
          </MasonryGrid>
        </section>
      ) : null}
      {tilePreviewOpen && previewUrl ? (
        <div className="tile-preview-modal" role="dialog" aria-modal="true">
          <button
            className="tile-preview-modal__close"
            onClick={() => setTilePreviewOpen(false)}
            aria-label="Cerrar"
          >
            ✕
          </button>
          <div
            className="tile-preview-modal__canvas"
            style={{ backgroundImage: `url(${displayUrl || previewUrl})` }}
          />
        </div>
      ) : null}
      {downloadOpen ? (
        <div className="tile-download-modal" role="dialog" aria-modal="true">
          <div className="tile-download-modal__card">
            <button
              className="tile-download-modal__close"
              onClick={() => setDownloadOpen(false)}
              aria-label="Cerrar"
            >
              ✕
            </button>
            <h3>Descargar</h3>
            <p>Selecciona un tamaño.</p>
            <div className="tile-download-modal__grid">
              {[
                { label: "Original", value: "original" },
                { label: "256 px", value: "256" },
                { label: "512 px", value: "512" },
                { label: "768 px", value: "768" },
                { label: "1024 px", value: "1024" },
                { label: "2048 px", value: "2048" },
                { label: "4096 px", value: "4096" },
              ].map((option) => (
                <button
                  key={option.value}
                  className="btn-pill ghost"
                  disabled={downloadLoading}
                  onClick={async () => {
                    setDownloadLoading(true);
                    try {
                      const response = await fetch(
                        `/api/tiles/${tile._id}/download?size=${option.value}`,
                        { credentials: "same-origin" }
                      );
                      if (!response.ok) {
                        const redirect = encodeURIComponent(
                          `${location.pathname}${location.search}`
                        );
                        navigate(`/login?redirect=${redirect}`);
                        return;
                      }
                      const data = await response.json();
                      if (data?.url) window.location.href = data.url;
                    } finally {
                      setDownloadLoading(false);
                      setDownloadOpen(false);
                    }
                  }}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );

  if (hasBackground) {
    return (
      <div className="modal-card">
        <button className="modal-close" onClick={() => navigate(-1)}>
          ✕
        </button>
        {content}
      </div>
    );
  }

  return (
    <main className="page">
      <section className="page__inner">{content}</section>
    </main>
  );
}
