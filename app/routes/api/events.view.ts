import type { Route } from "./+types/events.view";

import { initServer } from "../../lib/init.server";
import { json, parseJson, jsonError, jsonOk } from "../../lib/api.server";
import { trackViewSchema } from "../../lib/validation.server";
import { trackEvent } from "../../lib/events.server";
import { getClientIp, getUserAgent } from "../../lib/request.server";
import { getUserFromRequest } from "../../lib/auth.server";
import { incrementTileStats } from "../../lib/tiles.server";

export async function action({ request }: Route.ActionArgs) {
  await initServer();
  const body = await parseJson(request);
  const parsed = trackViewSchema.safeParse(body);
  if (!parsed.success) return jsonError("Invalid input", 400);

  const user = await getUserFromRequest(request);

  await trackEvent({
    type: "view",
    userId: user?.id,
    tileId: parsed.data.tileId,
    ip: getClientIp(request),
    userAgent: getUserAgent(request),
  });

  await incrementTileStats(parsed.data.tileId, "views");
  return jsonOk({});
}

export function loader() {
  return json({ ok: false, error: "Method not allowed" }, { status: 405 });
}
