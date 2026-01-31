import type { Route } from "./+types/events.search";

import { initServer } from "../../lib/init.server";
import { json, parseJson, jsonError, jsonOk } from "../../lib/api";
import { trackSearchSchema } from "../../lib/validation.server";
import { trackEvent } from "../../lib/events.server";
import { getClientIp, getUserAgent } from "../../lib/request.server";
import { getUserFromRequest } from "../../lib/auth.server";

export async function action({ request }: Route.ActionArgs) {
  await initServer();
  const body = await parseJson(request);
  const parsed = trackSearchSchema.safeParse(body);
  if (!parsed.success) return jsonError("Invalid input", 400);

  const user = await getUserFromRequest(request);
  await trackEvent({
    type: "search",
    userId: user?.id,
    ip: getClientIp(request),
    userAgent: getUserAgent(request),
    meta: parsed.data,
  });

  return jsonOk({});
}

export function loader() {
  return json({ ok: false, error: "Method not allowed" }, { status: 405 });
}
