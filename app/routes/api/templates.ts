import type { Route } from "./+types/templates";

import { json, jsonError } from "../../lib/api.server";
import { JsonTemplateStore } from "../../lib/templates.server";

export async function loader() {
  const store = new JsonTemplateStore();
  const templates = await store.listTemplates();
  const safe = templates.map(({ promptTemplate, ...rest }) => rest);
  return json({ ok: true, templates: safe });
}

export function action() {
  return jsonError("Method not allowed", 405);
}
