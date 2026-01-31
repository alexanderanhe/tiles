import type { Route } from "./+types/tiles.$id.preview";

import { initServer } from "../../lib/init.server";
import { json, jsonError, jsonOk } from "../../lib/api";
import { getUserFromRequest } from "../../lib/auth.server";
import { findTileById } from "../../lib/tiles.server";
import { getR2PublicUrl, signDownloadUrl } from "../../lib/r2.client.server";

export async function loader({ request, params }: Route.LoaderArgs) {
  await initServer();
  const tile = await findTileById(params.id ?? "");
  if (!tile) return jsonError("Tile not found", 404);
  const user = await getUserFromRequest(request);
  const isOwner = user && (user.id === tile.ownerId || user.role === "admin");
  if (tile.visibility === "private" && !isOwner) {
    return jsonError("Forbidden", 403);
  }

  if (!tile.r2.previewKey) {
    if (isOwner && tile.r2.masterKey) {
      const url = await signDownloadUrl(tile.r2.masterKey);
      return jsonOk({ url, public: false, fallback: "master" });
    }
    return jsonError("Preview not ready", 400);
  }

  const publicUrl = getR2PublicUrl(tile.r2.previewKey);
  if (publicUrl && tile.visibility === "public") {
    return jsonOk({ url: publicUrl, public: true });
  }

  const url = await signDownloadUrl(tile.r2.previewKey);
  return jsonOk({ url, public: false });
}

export function action() {
  return json({ ok: false, error: "Method not allowed" }, { status: 405 });
}
