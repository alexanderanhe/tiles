import type { Route } from "./+types/tiles.$id.finalize";

import { initServer } from "../../lib/init.server";
import { json, jsonError, jsonOk } from "../../lib/api.server";
import { requireUser } from "../../lib/auth.server";
import { findTileById, updateTileR2 } from "../../lib/tiles.server";
import { getObject, headObject, putObject } from "../../lib/r2.client.server";
import { streamToBuffer } from "../../lib/streams.server";
import { applyWatermark, getImageMetadata } from "../../lib/watermark.server";

export async function action({ request, params }: Route.ActionArgs) {
  await initServer();
  const user = await requireUser(request, { api: true });

  const tile = await findTileById(params.id ?? "");
  if (!tile) return jsonError("Tile not found", 404);
  if (tile.ownerId !== user.id && user.role !== "admin") {
    return jsonError("Forbidden", 403);
  }

  if (!tile.r2.masterKey) {
    return jsonError("Missing master upload", 400);
  }

  const head = await headObject(tile.r2.masterKey).catch(() => null);
  if (!head) return jsonError("Master not found in storage", 404);

  const object = await getObject(tile.r2.masterKey);
  const body = await streamToBuffer(object.Body ?? null);
  if (!body.length) return jsonError("Master file empty", 400);

  const metadata = await getImageMetadata(body);

  const preview = await applyWatermark(body, 1600);
  const thumb = await applyWatermark(body, 400);

  const previewKey = `tiles/${tile._id}/preview.webp`;
  const thumbKey = `tiles/${tile._id}/thumb.webp`;

  await putObject(previewKey, preview.data, "image/webp");
  await putObject(thumbKey, thumb.data, "image/webp");

  await updateTileR2(
    tile._id,
    {
      masterKey: tile.r2.masterKey,
      previewKey,
      thumbKey,
      sizeBytes: Number(head.ContentLength ?? 0),
      etag: head.ETag?.replace(/\"/g, ""),
    },
    {
      width: metadata.width,
      height: metadata.height,
      format: metadata.format,
    }
  );

  return jsonOk({
    tileId: tile._id,
    previewKey,
    thumbKey,
  });
}

export function loader() {
  return json({ ok: false, error: "Method not allowed" }, { status: 405 });
}
