import type { Route } from "./+types/tiles.$id.preview";

import { initServer } from "../../lib/init.server";
import { json, jsonError, jsonOk } from "../../lib/api";
import { getUserFromRequest } from "../../lib/auth.server";
import { findTileById } from "../../lib/tiles.server";
import { getObject, getR2PublicUrl, putObject, signDownloadUrl } from "../../lib/r2.client.server";
import { streamToBuffer } from "../../lib/streams.server";
import { createThumbnail } from "../../lib/watermark.server";

export async function loader({ request, params }: Route.LoaderArgs) {
  await initServer();
  const tile = await findTileById(params.id ?? "");
  if (!tile) return jsonError("Tile not found", 404);
  const user = await getUserFromRequest(request);
  const isOwner = user && (user.id === tile.ownerId || user.role === "admin");
  if (tile.visibility === "private" && !isOwner) {
    return jsonError("Forbidden", 403);
  }

  const previewKey = tile.r2.thumbCleanKey || tile.r2.previewKey;
  if (!previewKey) {
    if (tile.r2.masterKey) {
      const object = await getObject(tile.r2.masterKey);
      const body = await streamToBuffer(object.Body ?? null);
      if (body.length) {
        const cleanThumb = await createThumbnail(body, 400);
        const thumbCleanKey = `tiles/${tile._id}/thumb-clean.webp`;
        await putObject(thumbCleanKey, cleanThumb.data, "image/webp");
        const publicUrl = getR2PublicUrl(thumbCleanKey);
        if (publicUrl && tile.visibility === "public") {
          return jsonOk({ url: publicUrl, public: true });
        }
        const signed = await signDownloadUrl(thumbCleanKey);
        return jsonOk({ url: signed, public: false });
      }
    }
    return jsonError("Preview not ready", 400);
  }

  const publicUrl = getR2PublicUrl(previewKey);
  if (publicUrl && tile.visibility === "public") {
    return jsonOk({ url: publicUrl, public: true });
  }

  const url = await signDownloadUrl(previewKey);
  return jsonOk({ url, public: false });
}

export function action() {
  return json({ ok: false, error: "Method not allowed" }, { status: 405 });
}
