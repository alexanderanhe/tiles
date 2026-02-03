import type { Route } from "./+types/prompts.$id.options";

import { json, jsonError } from "../../lib/api";
import { requireUser } from "../../lib/auth.server";
import { checkRateLimit } from "../../lib/rateLimit.server";
import { getClientIp } from "../../lib/request.server";
import { JsonPromptSourceStore, resolvePromptOptions } from "../../lib/prompt-sources.server";
import { JsonTemplateStore } from "../../lib/templates.server";

function getRequestParams(request: Request) {
  const url = new URL(request.url);
  const params: Record<string, string> = {};
  for (const [key, value] of url.searchParams.entries()) {
    params[key] = value;
  }
  return params;
}

export async function loader({ request, params }: Route.LoaderArgs) {
  await requireUser(request, { api: true });
  const ip = getClientIp(request) || "unknown";
  const rate = await checkRateLimit({
    key: `prompt-options:${ip}`,
    limit: 60,
    windowMs: 60 * 1000,
  });
  if (!rate.allowed) return jsonError("Too many requests", 429);
  const templateId = params.id;
  if (!templateId) return jsonError("Template id required", 400);

  const templateStore = new JsonTemplateStore();
  const template = await templateStore.getTemplate(templateId);
  if (!template) return jsonError("Template not found", 404);

  const sourceStore = new JsonPromptSourceStore();
  const source = await sourceStore.getSource(templateId);

  const options = await resolvePromptOptions({
    template,
    source,
    requestParams: getRequestParams(request),
  });

  return json(options);
}

export function action() {
  return jsonError("Method not allowed", 405);
}
