import type { Route } from "./+types/tiles.$id.download";

import { initServer } from "../../lib/init.server";
import { json, jsonError, jsonOk } from "../../lib/api";
import { requireUser, requireRole } from "../../lib/auth.server";
import { findTileById, incrementTileStats } from "../../lib/tiles.server";
import { signDownloadUrl } from "../../lib/r2.client.server";
import { checkRateLimit } from "../../lib/rateLimit.server";
import { env } from "../../lib/env.server";
import { getClientIp, getUserAgent } from "../../lib/request.server";
import { trackEvent } from "../../lib/events.server";

export async function loader({ request, params }: Route.LoaderArgs) {
  await initServer();
  const user = await requireUser(request, { api: true });
  requireRole(user, env.DOWNLOAD_REQUIRE_ROLE);

  const rate = await checkRateLimit({
    key: `download:${user.id}`,
    limit: 30,
    windowMs: 10 * 60 * 1000,
  });
  if (!rate.allowed) return jsonError("Too many requests", 429);

  const tile = await findTileById(params.id ?? "");
  if (!tile) return jsonError("Tile not found", 404);

  const isOwner = user.id === tile.ownerId || user.role === "admin";
  if (tile.visibility === "private" && !isOwner) {
    return jsonError("Forbidden", 403);
  }

  if (!tile.r2.masterKey) {
    return jsonError("Master not available", 400);
  }

  await trackEvent({
    type: "download_attempt",
    userId: user.id,
    tileId: tile._id,
    ip: getClientIp(request),
    userAgent: getUserAgent(request),
  });

  const url = await signDownloadUrl(tile.r2.masterKey);

  await trackEvent({
    type: "download_success",
    userId: user.id,
    tileId: tile._id,
    ip: getClientIp(request),
    userAgent: getUserAgent(request),
  });
  await incrementTileStats(tile._id, "downloads");

  return jsonOk({ url });
}

export function action() {
  return json({ ok: false, error: "Method not allowed" }, { status: 405 });
}
