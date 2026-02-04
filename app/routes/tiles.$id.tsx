import type { Route } from "./+types/tiles.$id";
import { useLoaderData, useNavigate } from "react-router";
import { useState } from "react";
import { initServer } from "../lib/init.server";
import { findTileById, incrementTileStats } from "../lib/tiles.server";
import { getR2PublicUrl, signDownloadUrl } from "../lib/r2.client.server";
import { getUserFromRequest } from "../lib/auth.server";
import { env } from "../lib/env.server";
import { trackEvent } from "../lib/events.server";
import { getClientIp, getUserAgent } from "../lib/request.server";
import { TagChips } from "../components/TagChips";
import { extractIdFromSlug } from "../lib/slug";

export async function loader({ request, params }: Route.LoaderArgs) {
  await initServer();
  const tileId = extractIdFromSlug(params.idSlug ?? "");
  const tile = await findTileById(tileId);
  if (!tile) throw new Response("Not found", { status: 404 });

  const user = await getUserFromRequest(request);
  const isOwner = user && (user.id === tile.ownerId || user.role === "admin");
  if (tile.visibility === "private" && !isOwner) {
    throw new Response("Not found", { status: 404 });
  }

  await trackEvent({
    type: "view",
    userId: user?.id,
    tileId: tile._id,
    ip: getClientIp(request),
    userAgent: getUserAgent(request),
  });
  await incrementTileStats(tile._id, "views");

  const previewKey = tile.r2.previewKey;
  const previewUrl = previewKey
    ? getR2PublicUrl(previewKey) || (await signDownloadUrl(previewKey))
    : "";

  const canDownload = Boolean(
    user &&
      (tile.visibility !== "private" || isOwner) &&
      (env.DOWNLOAD_REQUIRE_ROLE === "any_authenticated" ||
        user.role === env.DOWNLOAD_REQUIRE_ROLE ||
        user.role === "admin")
  );

  const origin = env.APP_BASE_URL?.replace(/\/$/, "") || new URL(request.url).origin;
  const canonicalUrl = `${origin}/tiles/${tile._id}`;
  return { tile, previewUrl, user, canDownload, canonicalUrl };
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

export default function TileDetail() {
  const { tile, previewUrl, user, canDownload } =
    useLoaderData<typeof loader>();
  const navigate = useNavigate();
  const isOwner = Boolean(user && (user.id === tile.ownerId || user.role === "admin"));
  const [editOpen, setEditOpen] = useState(false);
  const [editTitle, setEditTitle] = useState(tile.title ?? "");
  const [editDescription, setEditDescription] = useState(tile.description ?? "");
  const [editTags, setEditTags] = useState((tile.tags ?? []).join(", "));
  const [editVisibility, setEditVisibility] = useState(tile.visibility);
  const [editStatus, setEditStatus] = useState("");
  const [publishStatus, setPublishStatus] = useState("");
  const content = (
    <div className="tile-detail">
      <div className="tile-detail__image">
        {previewUrl ? (
          <img src={previewUrl} alt={tile.title} className="w-full" />
        ) : (
          <div className="tile-card__placeholder">Preview processing...</div>
        )}
      </div>
      <div className="tile-detail__meta">
        <div>
          <p className="tile-detail__label">Seamless Tile</p>
          <h1 className="tile-detail__title">{tile.title}</h1>
          <p className="tile-detail__desc">{tile.description}</p>
        </div>

        <TagChips tags={tile.tags} />

        <div className="tile-detail__actions">
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
              Descargar original
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
          {isOwner && tile.visibility === "private" ? (
            <button
              className="btn-pill"
              onClick={async () => {
                setPublishStatus("");
                const response = await fetch(`/api/tiles/${tile._id}`, {
                  method: "PATCH",
                  headers: { "content-type": "application/json" },
                  body: JSON.stringify({ visibility: "public" }),
                });
                if (!response.ok) {
                  setPublishStatus("No se pudo publicar.");
                  return;
                }
                setPublishStatus("Publicado.");
                setEditVisibility("public");
                navigate(0);
              }}
            >
              Publicar
            </button>
          ) : null}
          {isOwner ? (
            <button
              className="btn-pill ghost"
              onClick={() => setEditOpen((prev) => !prev)}
            >
              Editar
            </button>
          ) : null}
          {isOwner ? (
            <button
              className="btn-pill ghost"
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
              Eliminar
            </button>
          ) : null}
        </div>

        {isOwner && editOpen ? (
          <div className="tile-detail__edit">
            <label>
              Titulo
              <input
                className="input-field"
                type="text"
                placeholder="Titulo"
                value={editTitle}
                onChange={(event) => setEditTitle(event.target.value)}
              />
            </label>
            <label>
              Descripcion
              <textarea
                className="input-field"
                placeholder="Descripcion"
                value={editDescription}
                onChange={(event) => setEditDescription(event.target.value)}
                rows={3}
              />
            </label>
            <label>
              Tags
              <input
                className="input-field"
                type="text"
                placeholder="Tags separados por coma"
                value={editTags}
                onChange={(event) => setEditTags(event.target.value)}
              />
            </label>
            <label>
              Visibilidad
              <select
                className="input-field"
                value={editVisibility}
                onChange={(event) => setEditVisibility(event.target.value)}
              >
                <option value="public">Publico</option>
                <option value="unlisted">No listado</option>
                <option value="private">Privado</option>
              </select>
            </label>
            <button
              className="btn-primary"
              onClick={async () => {
                setEditStatus("");
                const response = await fetch(`/api/tiles/${tile._id}`, {
                  method: "PATCH",
                  headers: { "content-type": "application/json" },
                  body: JSON.stringify({
                    title: editTitle,
                    description: editDescription,
                    tags: editTags.split(",").map((tag) => tag.trim()).filter(Boolean),
                    visibility: editVisibility,
                  }),
                });
                if (!response.ok) {
                  setEditStatus("No se pudo guardar.");
                  return;
                }
                setEditStatus("Guardado.");
                navigate(0);
              }}
              type="button"
            >
              Guardar cambios
            </button>
            {editStatus ? <p className="tile-detail__status">{editStatus}</p> : null}
          </div>
        ) : null}
        {publishStatus ? <p className="tile-detail__status">{publishStatus}</p> : null}

        <div className="tile-detail__stats">
          <p>Formato: {tile.format ?? "original"}</p>
          <p>
            Tamaño: {tile.width ?? "—"} × {tile.height ?? "—"}
          </p>
          <p>Seamless: {tile.seamless ? "Sí" : "No"}</p>
          <p>Visibilidad: {tile.visibility}</p>
        </div>
      </div>
    </div>
  );

  return (
    <main className="page">
      <section className="page__inner">{content}</section>
    </main>
  );
}
