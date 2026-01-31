import type { Route } from "./+types/u.$username.$idSlug";
import { useLoaderData, useLocation, useNavigate } from "react-router";
import type { Location } from "react-router";
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
    : isOwner && tile.r2.masterKey
      ? await signDownloadUrl(tile.r2.masterKey)
      : "";

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
        const key = item.r2.previewKey;
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

  return {
    tile,
    previewUrl,
    user,
    related,
    canDownload,
    isOwner,
    handle: canonicalHandle,
  };
}

export function meta({ data }: Route.MetaArgs) {
  const title = data?.tile?.title ?? "Tile";
  const description =
    data?.tile?.description ?? "Seamless tile available for preview and download.";
  return [
    { title: `${title} — Seamless Tiles` },
    { name: "description", content: description },
  ];
}

export default function UserTileDetail() {
  const { tile, previewUrl, user, related, canDownload, isOwner, handle } =
    useLoaderData<typeof loader>();
  const navigate = useNavigate();
  const location = useLocation();
  const hasBackground = Boolean(
    (location.state as { backgroundLocation?: Location })?.backgroundLocation
  );

  const content = (
    <div className="tile-page">
      <div className="tile-page__header">
        <div className="tile-page__author">
          <div className="tile-page__avatar">
            {(user.username ?? user.name ?? user.email).slice(0, 2).toUpperCase()}
          </div>
          <div>
            <p className="tile-page__name">{user.name ?? user.username ?? user.email}</p>
            <p className="tile-page__handle">@{handle}</p>
          </div>
        </div>
        <div className="tile-page__actions">
          {canDownload ? (
            <button
              className="btn-pill primary"
              onClick={async () => {
                const response = await fetch(`/api/tiles/${tile._id}/download`, {
                  credentials: "same-origin",
                });
                if (!response.ok) {
                  navigate("/login");
                  return;
                }
                const data = await response.json();
                if (data?.url) window.location.href = data.url;
              }}
            >
              Descargar
            </button>
          ) : (
            <button className="btn-pill primary" onClick={() => navigate("/login")}>
              Iniciar sesión
            </button>
          )}
          <button
            className="btn-pill ghost"
            onClick={() => navigator.clipboard.writeText(window.location.href)}
          >
            Copiar enlace
          </button>
          {isOwner ? (
            <button
              className="btn-pill ghost"
              onClick={() => navigate(`/tiles/${tile._id}`)}
            >
              Editar
            </button>
          ) : null}
        </div>
      </div>

      <div className="tile-page__content">
        <div className="tile-page__image">
          {previewUrl ? (
            <img src={previewUrl} alt={tile.title} />
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
