import type { Route } from "./+types/tiles.$id.download";

import { initServer } from "../../lib/init.server";
import { json, jsonError, jsonOk } from "../../lib/api";
import { requireUser, requireRole } from "../../lib/auth.server";
import { findTileById, incrementTileStats } from "../../lib/tiles.server";
import { getObject, headObject, putObject, signDownloadUrl } from "../../lib/r2.client.server";
import { checkRateLimit } from "../../lib/rateLimit.server";
import { env } from "../../lib/env.server";
import { getClientIp, getUserAgent } from "../../lib/request.server";
import { trackEvent } from "../../lib/events.server";
import { streamToBuffer } from "../../lib/streams.server";
import sharp from "sharp";

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

  const urlObj = new URL(request.url);
  const sizeParam = urlObj.searchParams.get("size");
  const allowedSizes = new Set(["256", "512", "768", "1024", "2048", "4096"]);
  if (sizeParam && sizeParam !== "original" && !allowedSizes.has(sizeParam)) {
    return jsonError("Invalid size", 400);
  }

  await trackEvent({
    type: "download_attempt",
    userId: user.id,
    tileId: tile._id,
    ip: getClientIp(request),
    userAgent: getUserAgent(request),
  });

  let url = "";
  if (!sizeParam || sizeParam === "original") {
    url = await signDownloadUrl(tile.r2.masterKey);
  } else {
    const size = Number(sizeParam);
    const sizedKey = `tiles/${tile._id}/download-${size}.webp`;
    const exists = await headObject(sizedKey).catch(() => null);
    if (!exists) {
      const object = await getObject(tile.r2.masterKey);
      const body = await streamToBuffer(object.Body ?? null);
      if (!body.length) return jsonError("Master file empty", 400);
      const resized = await sharp(body)
        .resize({ width: size, height: size, fit: "inside", withoutEnlargement: true })
        .webp({ quality: 90 })
        .toBuffer();
      await putObject(sizedKey, resized, "image/webp");
    }
    url = await signDownloadUrl(sizedKey);
  }

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
