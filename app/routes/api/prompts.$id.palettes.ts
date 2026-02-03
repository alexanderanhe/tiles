import type { Route } from "./+types/prompts.$id.palettes";

import { json, jsonError } from "../../lib/api";
import { checkRateLimit } from "../../lib/rateLimit.server";
import { getClientIp } from "../../lib/request.server";
import { JsonPromptSourceStore } from "../../lib/prompt-sources.server";
import { JsonTemplateStore } from "../../lib/templates.server";
import { suggestPalettes } from "../../lib/palettes.server";

function getRequestParams(request: Request) {
  const url = new URL(request.url);
  const params: Record<string, string> = {};
  for (const [key, value] of url.searchParams.entries()) {
    params[key] = value;
  }
  return params;
}

export async function loader({ request, params }: Route.LoaderArgs) {
  const ip = getClientIp(request) || "unknown";
  const rate = await checkRateLimit({
    key: `palettes:${ip}`,
    limit: 30,
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
  if (!source?.color) {
    return json({ templateId, suggestions: { palettes: [] }, reason: "No color module" });
  }

  const requestParams = getRequestParams(request);
  const engine =
    requestParams.engine || source.color.defaultEngine || source.color.engines?.[0] || "thecolorapi";
  const strategyId = requestParams.strategy;
  const strategy =
    source.color.strategies?.find((item) => item.id === strategyId) ??
    source.color.strategies?.[0];
  const seed =
    requestParams.seed ||
    requestParams.themeId ||
    requestParams.cityId ||
    templateId;

  const limits = {
    palettes: source.color.limits?.palettes ?? 6,
    minColors: source.color.limits?.minColors ?? 3,
    maxColors: source.color.limits?.maxColors ?? 5,
  };

  const result = await suggestPalettes({
    templateId,
    engine,
    strategy,
    seed,
    limits,
    cacheTtlSeconds: source.color.cache?.ttlSeconds,
  });

  return json({
    templateId,
    suggestions: { palettes: result.palettes },
    source: { provider: "color", engine, strategy: strategy?.id },
    cache: result.cache,
  });
}

export function action() {
  return jsonError("Method not allowed", 405);
}
