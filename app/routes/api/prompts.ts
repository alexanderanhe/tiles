import type { Route } from "./+types/prompts";

import { json, jsonError } from "../../lib/api";
import { requireUser } from "../../lib/auth.server";
import { getCollections } from "../../lib/db.server";
import { getR2PublicUrl, signDownloadUrl } from "../../lib/r2.client.server";
import { JsonTemplateStore } from "../../lib/templates.server";

export async function loader({ request }: Route.LoaderArgs) {
  const user = await requireUser(request, { api: true });
  const store = new JsonTemplateStore();
  const templates = await store.listTemplates();
  const { tiles } = await getCollections();
  const safe = await Promise.all(
    templates.map(async ({ promptTemplate, ...rest }) => {
      const recent = await tiles
        .find({
          ownerId: user.id,
          $or: [{ templateId: rest.id }, { "meta.templateId": rest.id }],
        })
        .sort({ createdAt: -1 })
        .limit(3)
        .toArray();

      const samples: string[] = [];
      for (const tile of recent) {
        const key = tile.r2.previewKey || tile.r2.masterKey;
        if (!key) continue;
        const url = getR2PublicUrl(key) || (await signDownloadUrl(key));
        samples.push(url);
      }

      return { ...rest, samples };
    })
  );
  return json({ ok: true, templates: safe });
}

export function action() {
  return jsonError("Method not allowed", 405);
}
