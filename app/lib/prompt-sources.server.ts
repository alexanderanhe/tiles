import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { getRedis } from "./redis.server";
import type { PromptTemplate } from "./templates.server";

export interface PromptSourceOption {
  id: string;
  label?: string;
}

export type PromptSourceParamProvider =
  | {
      type: "static";
      options: PromptSourceOption[];
      labelKey?: string;
      keywordsKey?: string;
    }
  | {
      type: "search";
      provider?: string;
      query?: Record<string, unknown>;
      limit?: number;
      searchParam?: string;
      labelKey?: string;
      keywordsKey?: string;
    }
  | {
      type: "dependent";
      provider?: string;
      dependsOn: string[];
      query?: Record<string, unknown>;
      limit?: number;
      labelKey?: string;
      keywordsKey?: string;
    };

export interface PromptSourceEntityResolver {
  provider: string;
  config?: Record<string, unknown>;
}

export interface PromptSourceSanitization {
  maxLength?: number;
  allowedPattern?: string;
}

export interface PromptSourceCache {
  ttlSeconds?: number;
}

export interface PromptSource {
  id: string;
  provider: string;
  version?: string;
  paramProviders: Record<string, PromptSourceParamProvider>;
  entityResolver?: PromptSourceEntityResolver;
  sanitization?: PromptSourceSanitization;
  cache?: PromptSourceCache;
  color?: {
    engines?: string[];
    defaultEngine?: string;
    cache?: PromptSourceCache;
    limits?: { palettes?: number; minColors?: number; maxColors?: number };
    strategies?: Array<{
      id: string;
      backgroundPolicy?: "pastel" | "light" | "neutral";
      mode?: string;
      count?: number;
    }>;
  };
}

export interface PromptSourceStore {
  listSources(): Promise<PromptSource[]>;
  getSource(id: string): Promise<PromptSource | null>;
}

const paramSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("static"),
    options: z.array(z.object({ id: z.string().min(1), label: z.string().min(1).optional() })),
    labelKey: z.string().min(1).optional(),
    keywordsKey: z.string().min(1).optional(),
  }),
  z.object({
    type: z.literal("search"),
    provider: z.string().min(1).optional(),
    query: z.record(z.any()).optional(),
    limit: z.number().int().positive().optional(),
    searchParam: z.string().min(1).optional(),
    labelKey: z.string().min(1).optional(),
    keywordsKey: z.string().min(1).optional(),
  }),
  z.object({
    type: z.literal("dependent"),
    provider: z.string().min(1).optional(),
    dependsOn: z.array(z.string().min(1)).min(1),
    query: z.record(z.any()).optional(),
    limit: z.number().int().positive().optional(),
    labelKey: z.string().min(1).optional(),
    keywordsKey: z.string().min(1).optional(),
  }),
]);

const sourceSchema = z.object({
  id: z.string().min(1),
  provider: z.string().min(1),
  version: z.string().optional(),
  paramProviders: z.record(paramSchema),
  entityResolver: z
    .object({
      provider: z.string().min(1),
      config: z.record(z.any()).optional(),
    })
    .optional(),
  color: z
    .object({
      engines: z.array(z.string().min(1)).optional(),
      defaultEngine: z.string().min(1).optional(),
      cache: z
        .object({
          ttlSeconds: z.number().int().positive().optional(),
        })
        .optional(),
      limits: z
        .object({
          palettes: z.number().int().positive().optional(),
          minColors: z.number().int().positive().optional(),
          maxColors: z.number().int().positive().optional(),
        })
        .optional(),
      strategies: z
        .array(
          z.object({
            id: z.string().min(1),
            backgroundPolicy: z.enum(["pastel", "light", "neutral"]).optional(),
            mode: z.string().min(1).optional(),
            count: z.number().int().positive().optional(),
          })
        )
        .optional(),
    })
    .optional(),
  sanitization: z
    .object({
      maxLength: z.number().int().positive().optional(),
      allowedPattern: z.string().min(1).optional(),
    })
    .optional(),
  cache: z
    .object({
      ttlSeconds: z.number().int().positive().optional(),
    })
    .optional(),
});

const listSchema = z.array(sourceSchema);

function getSourcesPath() {
  const here = path.dirname(fileURLToPath(import.meta.url));
  return path.join(here, "..", "data", "prompt-sources.json");
}

async function readSourcesFile(): Promise<PromptSource[]> {
  try {
    const raw = await fs.readFile(getSourcesPath(), "utf8");
    const parsed = JSON.parse(raw);
    return listSchema.parse(parsed) as PromptSource[];
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return [];
    }
    throw error;
  }
}

async function getSourcesCacheVersion() {
  try {
    const stat = await fs.stat(getSourcesPath());
    return String(stat.mtimeMs);
  } catch {
    return "0";
  }
}

export class JsonPromptSourceStore implements PromptSourceStore {
  async listSources() {
    const redis = getRedis();
    const version = await getSourcesCacheVersion();
    const cacheKey = `prompt-sources:list:${version}`;
    if (redis) {
      const cached = await redis.get(cacheKey);
      if (cached) return JSON.parse(cached) as PromptSource[];
    }
    const sources = await readSourcesFile();
    if (redis) {
      await redis.set(cacheKey, JSON.stringify(sources), "EX", 600);
    }
    return sources;
  }

  async getSource(id: string) {
    const redis = getRedis();
    const version = await getSourcesCacheVersion();
    const cacheKey = `prompt-sources:${id}:${version}`;
    if (redis) {
      const cached = await redis.get(cacheKey);
      if (cached) return JSON.parse(cached) as PromptSource;
    }
    const sources = await this.listSources();
    const source = sources.find((item) => item.id === id) ?? null;
    if (redis && source) {
      await redis.set(cacheKey, JSON.stringify(source), "EX", 600);
    }
    return source;
  }
}

export interface PromptOptionsResponse {
  templateId: string;
  options: Record<string, PromptSourceOption[]>;
  source?: { provider: string; version?: string };
  cache?: { hit: boolean; ttlSeconds?: number };
}

export interface PromptOptionContext {
  template: PromptTemplate;
  source: PromptSource;
  requestParams: Record<string, string | undefined>;
}

export interface ProviderAdapter {
  search?: (
    param: Extract<PromptSourceParamProvider, { type: "search" }>,
    context: PromptOptionContext
  ) => Promise<PromptSourceOption[]>;
  dependent?: (
    param: Extract<PromptSourceParamProvider, { type: "dependent" }>,
    context: PromptOptionContext
  ) => Promise<PromptSourceOption[]>;
  resolve?: (
    ids: string[],
    source: PromptSource
  ) => Promise<Record<string, { label: string; keywords?: string[] }>>;
}

const providerRegistry = new Map<string, ProviderAdapter>();

providerRegistry.set("static", {
  resolve: async (ids, source) => {
    const map = buildStaticLabelMap(source);
    const resolved: Record<string, { label: string; keywords?: string[] }> = {};
    for (const id of ids) {
      const label = map.get(id);
      if (label) resolved[id] = { label };
    }
    return resolved;
  },
});

providerRegistry.set("wikidata", {
  search: async (param, context) => {
    const searchParam = param.searchParam ?? "q";
    const query = context.requestParams[searchParam] ?? "";
    if (!query) return [];
    const limit = param.limit ?? 10;
    const url = new URL("https://www.wikidata.org/w/api.php");
    url.searchParams.set("action", "wbsearchentities");
    url.searchParams.set("search", query);
    url.searchParams.set("language", "en");
    url.searchParams.set("format", "json");
    url.searchParams.set("limit", String(limit));
    url.searchParams.set("type", "item");
    const response = await fetch(url.toString());
    if (!response.ok) return [];
    const data = (await response.json()) as { search?: { id: string; label?: string }[] };
    return (data.search ?? []).map((item) => ({ id: item.id, label: item.label }));
  },
  dependent: async (param, context) => {
    const sparql = param.query?.sparql;
    if (!sparql || typeof sparql !== "string") return [];
    const limit = param.limit ?? 20;
    const rendered = renderSparql(sparql, context.requestParams, limit);
    return await runWikidataSparql(rendered);
  },
  resolve: async (ids, source) => {
    if (!ids.length) return {};
    const labelLangs =
      (source.entityResolver?.config?.labelLangs as string[] | undefined) ?? ["en"];
    const aliasLangs =
      (source.entityResolver?.config?.aliasLangs as string[] | undefined) ?? ["en"];
    const url = new URL("https://www.wikidata.org/w/api.php");
    url.searchParams.set("action", "wbgetentities");
    url.searchParams.set("ids", ids.join("|"));
    url.searchParams.set("format", "json");
    url.searchParams.set("props", "labels|aliases");
    url.searchParams.set(
      "languages",
      Array.from(new Set([...labelLangs, ...aliasLangs])).join("|")
    );
    const response = await fetch(url.toString());
    if (!response.ok) return {};
    const data = (await response.json()) as {
      entities?: Record<
        string,
        {
          labels?: Record<string, { value: string }>;
          aliases?: Record<string, { value: string }[]>;
        }
      >;
    };
    const resolved: Record<string, { label: string; keywords?: string[] }> = {};
    for (const id of ids) {
      const labels = data.entities?.[id]?.labels ?? {};
      const label =
        labelLangs.map((lang) => labels?.[lang]?.value).find(Boolean) ??
        Object.values(labels)[0]?.value;
      if (!label) continue;
      const aliasMap = data.entities?.[id]?.aliases ?? {};
      const keywords = aliasLangs
        .flatMap((lang) => aliasMap?.[lang] ?? [])
        .map((alias) => alias.value)
        .filter(Boolean);
      resolved[id] = { label, keywords };
    }
    return resolved;
  },
});

function renderSparql(
  template: string,
  params: Record<string, string | undefined>,
  limit: number
) {
  let output = template;
  for (const [key, value] of Object.entries(params)) {
    if (!value) continue;
    const safeValue = value.replace(/"/g, '\\"');
    output = output.replaceAll(`{{${key}}}`, safeValue);
  }
  output = output.replaceAll("{{limit}}", String(limit));
  return output;
}

async function runWikidataSparql(query: string): Promise<PromptSourceOption[]> {
  if (process.env.NODE_ENV !== "production") {
    console.info("[prompt-sources] SPARQL query", query);
  }
  const url = new URL("https://query.wikidata.org/sparql");
  url.searchParams.set("format", "json");
  url.searchParams.set("query", query);
  const response = await fetch(url.toString(), {
    headers: {
      accept: "application/sparql-results+json",
      "user-agent": "seamless-tiles-dev/1.0 (https://localhost)",
    },
  });
  if (!response.ok) {
    if (process.env.NODE_ENV !== "production") {
      const body = await response.text().catch(() => "");
      console.warn(
        "[prompt-sources] SPARQL request failed",
        response.status,
        response.statusText,
        body.slice(0, 500)
      );
    }
    return [];
  }
  const data = (await response.json()) as {
    results?: { bindings?: { id?: { value?: string }; label?: { value?: string } }[] };
  };
  const raw = (data.results?.bindings ?? [])
    .map((binding) => ({
      id: binding.id?.value?.split("/").pop() ?? "",
      label: binding.label?.value ?? "",
    }))
    .filter((item) => item.id);

  const seenLabels = new Set<string>();
  const deduped: PromptSourceOption[] = [];
  for (const item of raw) {
    const labelKey = item.label.trim().toLowerCase();
    if (!labelKey) {
      deduped.push(item);
      continue;
    }
    if (seenLabels.has(labelKey)) continue;
    seenLabels.add(labelKey);
    deduped.push(item);
  }
  return deduped;
}

function hashInput(value: unknown) {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function normalizeOptions(
  options: PromptSourceOption[],
  sanitization?: PromptSourceSanitization,
  limit?: number
) {
  const seen = new Set<string>();
  const result: PromptSourceOption[] = [];
  for (const option of options) {
    const id = String(option.id ?? "").trim();
    if (!id || seen.has(id)) continue;
    const label = sanitizeLabel(option.label ?? id, sanitization);
    if (!label) continue;
    seen.add(id);
    result.push({ id, label });
    if (limit && result.length >= limit) break;
  }
  return result;
}

export function sanitizeLabel(value: string, sanitization?: PromptSourceSanitization) {
  const maxLength = sanitization?.maxLength ?? 80;
  const allowedPattern = sanitization?.allowedPattern ?? "A-Za-z0-9 ,.'-";
  const disallowed = new RegExp(`[^${allowedPattern}]+`, "g");
  const cleaned = value
    .replace(/[\r\n]+/g, " ")
    .replace(disallowed, "")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned.slice(0, maxLength);
}

function getProviderName(source: PromptSource, param: PromptSourceParamProvider) {
  if (param.type === "static") return "static";
  return param.provider ?? source.provider;
}

export function buildStaticOptionsFromTemplate(template: PromptTemplate) {
  const options: Record<string, PromptSourceOption[]> = {};
  for (const [key, def] of Object.entries(template.paramsSchema)) {
    if (def.type === "string" && def.enum?.length) {
      options[key] = def.enum.map((value) => ({ id: value, label: value }));
      continue;
    }
    if (def.type === "array" && def.items.enum?.length) {
      options[key] = def.items.enum.map((value) => ({ id: value, label: value }));
      continue;
    }
    const fallback = template.defaults?.[key];
    if (typeof fallback === "string") {
      options[key] = [{ id: fallback, label: fallback }];
      continue;
    }
    if (Array.isArray(fallback)) {
      options[key] = fallback.map((value) => ({ id: String(value), label: String(value) }));
      continue;
    }
  }
  return options;
}

async function getCachedOptions(
  source: PromptSource,
  paramName: string,
  cacheKeyInput: unknown
) {
  const ttl = source.cache?.ttlSeconds ?? 0;
  if (!ttl) return null;
  const redis = getRedis();
  if (!redis) return null;
  const cacheKey = `prompt-sources:options:${source.id}:${paramName}:${hashInput(cacheKeyInput)}`;
  const cached = await redis.get(cacheKey);
  if (!cached) return null;
  return JSON.parse(cached) as PromptSourceOption[];
}

async function setCachedOptions(
  source: PromptSource,
  paramName: string,
  cacheKeyInput: unknown,
  options: PromptSourceOption[]
) {
  const ttl = source.cache?.ttlSeconds ?? 0;
  if (!ttl) return;
  const redis = getRedis();
  if (!redis) return;
  const cacheKey = `prompt-sources:options:${source.id}:${paramName}:${hashInput(cacheKeyInput)}`;
  await redis.set(cacheKey, JSON.stringify(options), "EX", ttl);
}

async function getParamOptions(
  paramName: string,
  param: PromptSourceParamProvider,
  context: PromptOptionContext
) {
  if (param.type === "static") {
    return { options: normalizeOptions(param.options ?? [], context.source.sanitization, param.limit), hit: false };
  }

  const providerName = getProviderName(context.source, param);
  const provider = providerRegistry.get(providerName);
  const cacheKeyInput = { providerName, param, request: context.requestParams };
  const cached = await getCachedOptions(context.source, paramName, cacheKeyInput);
  if (cached) return { options: cached, hit: true };

  let options: PromptSourceOption[] = [];
  if (param.type === "search" && provider?.search) {
    options = await provider.search(param, context);
  }
  if (param.type === "dependent" && provider?.dependent) {
    const ready = param.dependsOn.every((key) => Boolean(context.requestParams[key]));
    options = ready ? await provider.dependent(param, context) : [];
  }

  const normalized = normalizeOptions(
    options,
    context.source.sanitization,
    param.limit
  );
  await setCachedOptions(context.source, paramName, cacheKeyInput, normalized);
  return { options: normalized, hit: false };
}

export async function resolvePromptOptions({
  template,
  source,
  requestParams,
}: {
  template: PromptTemplate;
  source?: PromptSource | null;
  requestParams?: Record<string, string | undefined>;
}): Promise<PromptOptionsResponse> {
  const baseOptions = buildStaticOptionsFromTemplate(template);
  if (!source) {
    return { templateId: template.id, options: baseOptions };
  }

  const context: PromptOptionContext = {
    template,
    source,
    requestParams: requestParams ?? {},
  };

  const options = { ...baseOptions };
  let cacheHit = false;
  for (const [paramName, param] of Object.entries(source.paramProviders)) {
    if (!(paramName in template.paramsSchema)) continue;
    const result = await getParamOptions(paramName, param, context);
    options[paramName] = result.options;
    if (result.hit) cacheHit = true;
  }

  return {
    templateId: template.id,
    options,
    source: { provider: source.provider, version: source.version },
    cache: { hit: cacheHit, ttlSeconds: source.cache?.ttlSeconds },
  };
}

function buildStaticLabelMap(source: PromptSource) {
  const map = new Map<string, string>();
  for (const param of Object.values(source.paramProviders)) {
    if (param.type !== "static") continue;
    for (const option of param.options ?? []) {
      if (option.label) map.set(option.id, option.label);
    }
  }
  return map;
}

async function resolveLabelsWithProvider(
  source: PromptSource,
  ids: string[]
): Promise<Record<string, { label: string; keywords?: string[] }>> {
  if (!source.entityResolver) return {};
  const provider = providerRegistry.get(source.entityResolver.provider);
  if (!provider?.resolve) return {};
  return provider.resolve(ids, source);
}

export async function resolvePromptInput({
  template,
  source,
  params,
}: {
  template: PromptTemplate;
  source?: PromptSource | null;
  params: Record<string, unknown>;
}) {
  if (!source) return { safeInput: params, labels: {} };

  const staticLabels = buildStaticLabelMap(source);
  const idsToResolve: string[] = [];
  const idByParam: Record<string, string> = {};

  for (const [paramName] of Object.entries(source.paramProviders)) {
    if (!(paramName in template.paramsSchema)) continue;
    const value = params[paramName];
    if (typeof value !== "string" || value.length === 0) continue;
    idByParam[paramName] = value;
    if (!staticLabels.has(value)) idsToResolve.push(value);
  }

  if (idsToResolve.length && !source.entityResolver) {
    throw new Error("Missing resolver for source labels");
  }

  const resolvedByProvider = await resolveLabelsWithProvider(source, idsToResolve);
  const labelsById = new Map<string, { label: string; keywords?: string[] }>();
  for (const [id, label] of staticLabels.entries()) {
    labelsById.set(id, { label });
  }
  for (const [id, value] of Object.entries(resolvedByProvider)) {
    labelsById.set(id, value);
  }

  const safeInput = { ...params };
  const labels: Record<string, string> = {};

  for (const [paramName, id] of Object.entries(idByParam)) {
    const resolved = labelsById.get(id);
    if (!resolved?.label) {
      throw new Error(`Missing label for ${paramName}`);
    }
    const sanitized = sanitizeLabel(resolved.label, source.sanitization);
    if (!sanitized) {
      throw new Error(`Invalid label for ${paramName}`);
    }
    const labelKey = (source.paramProviders[paramName] as { labelKey?: string }).labelKey;
    safeInput[labelKey ?? paramName] = sanitized;
    const keywordsKey = (source.paramProviders[paramName] as { keywordsKey?: string })
      .keywordsKey;
    if (keywordsKey && resolved.keywords?.length) {
      const keywords = resolved.keywords
        .map((keyword) => sanitizeLabel(keyword, source.sanitization))
        .filter(Boolean)
        .slice(0, 8);
      if (keywords.length) {
        safeInput[keywordsKey] = keywords.join(", ");
      }
    }
    labels[paramName] = sanitized;
  }

  return { safeInput, labels };
}
