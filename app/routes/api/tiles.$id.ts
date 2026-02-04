import type { Route } from "./+types/tiles.$id";

import { initServer } from "../../lib/init.server";
import { json, jsonError, jsonOk, parseJson } from "../../lib/api";
import { getUserFromRequest } from "../../lib/auth.server";
import { deleteObject } from "../../lib/r2.client.server";
import { deleteTileById, findTileById, updateTileMeta } from "../../lib/tiles.server";
import { tileUpdateSchema } from "../../lib/validation.server";

export async function loader({ request, params }: Route.LoaderArgs) {
  await initServer();
  const tile = await findTileById(params.id ?? "");
  if (!tile) return jsonError("Not found", 404);

  const user = await getUserFromRequest(request);
  const isOwner = user && (user.id === tile.ownerId || user.role === "admin");

  if (tile.visibility === "private" && !isOwner) {
    return jsonError("Not found", 404);
  }

  return jsonOk({ tile });
}

export async function action({ request, params }: Route.ActionArgs) {
  await initServer();
  const user = await getUserFromRequest(request);
  if (!user) return jsonError("Unauthorized", 401);

  const tile = await findTileById(params.id ?? "");
  if (!tile) return jsonError("Not found", 404);

  const isOwner = user.id === tile.ownerId || user.role === "admin";
  if (!isOwner) return jsonError("Forbidden", 403);

  if (request.method !== "PATCH") {
    if (request.method === "DELETE") {
      const keys = [tile.r2.masterKey, tile.r2.previewKey, tile.r2.thumbKey].filter(
        Boolean
      ) as string[];
      await Promise.all(keys.map((key) => deleteObject(key).catch(() => null)));
      await deleteTileById(tile._id);
      return jsonOk({ ok: true });
    }
    return jsonError("Method not allowed", 405);
  }

  const body = await parseJson(request);
  const parsed = tileUpdateSchema.safeParse(body);
  if (!parsed.success) return jsonError("Invalid input", 400);

  const nextTitle = parsed.data.title?.trim();
  const update: Record<string, unknown> = {};
  if (parsed.data.title !== undefined) update.title = nextTitle || "Untitled";
  if (parsed.data.description !== undefined) update.description = parsed.data.description;
  if (parsed.data.tags !== undefined) update.tags = parsed.data.tags;
  if (parsed.data.visibility !== undefined) update.visibility = parsed.data.visibility;
  if (parsed.data.aiGenerated !== undefined) {
    update["meta.aiGenerated"] = parsed.data.aiGenerated;
  }

  await updateTileMeta(tile._id, update);
  return jsonOk({ ok: true });
}
