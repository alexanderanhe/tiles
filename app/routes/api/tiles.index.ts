import type { Route } from "./+types/tiles.index";
import { initServer } from "../../lib/init.server";
import { json, parseJson, jsonError, jsonOk } from "../../lib/api";
import { requireUser } from "../../lib/auth.server";
import { tileCreateSchema, tileListSchema } from "../../lib/validation.server";
import crypto from "node:crypto";
import {
  createTile,
  findTileByContentHashGlobal,
  listTiles,
  updateTileMeta,
} from "../../lib/tiles.server";
import { trackEvent } from "../../lib/events.server";
import { getClientIp, getUserAgent } from "../../lib/request.server";

export async function loader({ request }: Route.LoaderArgs) {
  await initServer();
  const url = new URL(request.url);
  const params = Object.fromEntries(url.searchParams.entries());
  const parsed = tileListSchema.safeParse({
    q: params.q ?? "",
    tags: params.tags ?? "",
    sort: params.sort ?? "new",
    page: params.page ?? "1",
    limit: params.limit ?? "24",
  });

  if (!parsed.success) return jsonError("Invalid query", 400);

  const tags = parsed.data.tags
    ? parsed.data.tags.split(",").map((tag) => tag.trim()).filter(Boolean)
    : [];

  const result = await listTiles({
    q: parsed.data.q,
    tags,
    sort: parsed.data.sort,
    page: parsed.data.page,
    limit: parsed.data.limit,
    visibility: ["public"],
  });

  return jsonOk({ items: result.items, total: result.total });
}

export async function action({ request }: Route.ActionArgs) {
  await initServer();
  const user = await requireUser(request, { api: true });

  const body = await parseJson(request);
  const parsed = tileCreateSchema.safeParse(body);
  if (!parsed.success) return jsonError("Invalid input", 400);

  const title = parsed.data.title?.trim() || "Untitled";
  if (parsed.data.contentHash) {
    const existing = await findTileByContentHashGlobal(parsed.data.contentHash);
    if (existing && existing.ownerId !== user.id) {
      return jsonError("Duplicate image", 409);
    }
    if (existing && existing.ownerId === user.id) {
      if (!parsed.data.replaceExisting) {
        return jsonError("Duplicate image", 409, { tileId: existing._id });
      }
      const title = parsed.data.title?.trim() || "Untitled";
      await updateTileMeta(existing._id, {
        title,
        description: parsed.data.description,
        tags: parsed.data.tags,
        visibility: parsed.data.visibility,
        seamless: parsed.data.seamless,
        format: parsed.data.format,
      });
      return jsonOk({ tile: { ...existing, title }, replaced: true });
    }
  }

  const tileId = crypto.randomUUID();
  const tile = await createTile({
    id: tileId,
    ownerId: user.id,
    title,
    description: parsed.data.description,
    tags: parsed.data.tags,
    contentHash: parsed.data.contentHash,
    seamless: parsed.data.seamless,
    visibility: parsed.data.visibility,
    format: parsed.data.format,
    masterKey: `tiles/${tileId}/master`,
  });

  await trackEvent({
    type: "upload",
    userId: user.id,
    tileId: tile._id,
    ip: getClientIp(request),
    userAgent: getUserAgent(request),
  });

  return jsonOk({ tile });
}
