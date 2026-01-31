import type { Route } from "./+types/tiles.mine";

import { initServer } from "../../lib/init.server";
import { jsonError, jsonOk } from "../../lib/api.server";
import { requireUser } from "../../lib/auth.server";
import { tileListSchema } from "../../lib/validation.server";
import { listTiles } from "../../lib/tiles.server";

export async function loader({ request }: Route.LoaderArgs) {
  await initServer();
  const user = await requireUser(request, { api: true });

  const url = new URL(request.url);
  const parsed = tileListSchema.safeParse({
    q: url.searchParams.get("q") ?? "",
    tags: url.searchParams.get("tags") ?? "",
    sort: url.searchParams.get("sort") ?? "new",
    page: url.searchParams.get("page") ?? "1",
    limit: url.searchParams.get("limit") ?? "24",
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
    ownerId: user.id,
  });

  return jsonOk({ items: result.items, total: result.total });
}

export function action() {
  return jsonError("Method not allowed", 405);
}
