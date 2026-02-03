import type { Route } from "./+types/prompts.$id.debug";

import { json, jsonError } from "../../lib/api";
import { requireUser } from "../../lib/auth.server";
import { JsonPromptSourceStore } from "../../lib/prompt-sources.server";
import { JsonTemplateStore } from "../../lib/templates.server";

function getRequestParams(request: Request) {
  const url = new URL(request.url);
  const params: Record<string, string> = {};
  for (const [key, value] of url.searchParams.entries()) {
    params[key] = value;
  }
  return params;
}

function renderSparql(template: string, params: Record<string, string>, limit: number) {
  let output = template;
  for (const [key, value] of Object.entries(params)) {
    output = output.replaceAll(`{{${key}}}`, value);
  }
  output = output.replaceAll("{{limit}}", String(limit));
  return output;
}

export async function loader({ request, params }: Route.LoaderArgs) {
  await requireUser(request, { api: true });
  if (process.env.NODE_ENV === "production") {
    return jsonError("Not available in production", 404);
  }

  const templateId = params.id;
  if (!templateId) return jsonError("Template id required", 400);
  const templateStore = new JsonTemplateStore();
  const template = await templateStore.getTemplate(templateId);
  if (!template) return jsonError("Template not found", 404);

  const sourceStore = new JsonPromptSourceStore();
  const source = await sourceStore.getSource(templateId);
  if (!source) return jsonError("Source not found", 404);

  const requestParams = getRequestParams(request);
  const results: Record<
    string,
    { provider: string; type: string; query?: string; dependsOn?: string[] }
  > = {};

  for (const [paramName, param] of Object.entries(source.paramProviders)) {
    const provider = param.type === "static" ? "static" : param.provider ?? source.provider;
    if (param.type === "dependent" && param.query?.sparql) {
      results[paramName] = {
        provider,
        type: param.type,
        dependsOn: param.dependsOn,
        query: renderSparql(
          String(param.query.sparql),
          requestParams,
          param.limit ?? 20
        ),
      };
      continue;
    }
    if (param.type === "search") {
      results[paramName] = {
        provider,
        type: param.type,
      };
      continue;
    }
    results[paramName] = { provider, type: param.type };
  }

  return json({
    templateId: template.id,
    params: requestParams,
    queries: results,
  });
}

export function action() {
  return jsonError("Method not allowed", 405);
}
