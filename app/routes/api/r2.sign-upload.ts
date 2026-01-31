import type { Route } from "./+types/r2.sign-upload";

import { initServer } from "../../lib/init.server";
import { json, parseJson, jsonError, jsonOk } from "../../lib/api";
import { requireUser } from "../../lib/auth.server";
import { signUploadSchema } from "../../lib/validation.server";
import { checkRateLimit } from "../../lib/rateLimit.server";
import { findTileById, updateTileR2 } from "../../lib/tiles.server";
import { signUploadUrl } from "../../lib/r2.client.server";

export async function action({ request }: Route.ActionArgs) {
  await initServer();
  const user = await requireUser(request, { api: true });

  const body = await parseJson(request);
  const parsed = signUploadSchema.safeParse(body);
  if (!parsed.success) return jsonError("Invalid input", 400);

  const rate = await checkRateLimit({
    key: `sign-upload:${user.id}`,
    limit: 20,
    windowMs: 10 * 60 * 1000,
  });
  if (!rate.allowed) return jsonError("Too many requests", 429);

  const tile = await findTileById(parsed.data.tileId);
  if (!tile) return jsonError("Tile not found", 404);
  if (tile.ownerId !== user.id && user.role !== "admin") {
    return jsonError("Forbidden", 403);
  }

  const masterKey = tile.r2.masterKey || `tiles/${tile._id}/master`;
  if (!tile.r2.masterKey) {
    await updateTileR2(tile._id, { ...tile.r2, masterKey }, {});
  }

  const url = await signUploadUrl(masterKey, parsed.data.contentType);
  return jsonOk({ uploadUrl: url, key: masterKey });
}

export function loader() {
  return json({ ok: false, error: "Method not allowed" }, { status: 405 });
}
