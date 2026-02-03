import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { getRedis } from "./redis.server";

export type TemplateParamSchema =
  | {
      type: "string";
      min?: number;
      max?: number;
      regex?: string;
      enum?: string[];
    }
  | {
      type: "array";
      minItems?: number;
      maxItems?: number;
      items: {
        type: "string";
        min?: number;
        max?: number;
        regex?: string;
        enum?: string[];
      };
    };

export interface PromptTemplate {
  id: string;
  name: string;
  description?: string;
  paramsSchema: Record<string, TemplateParamSchema>;
  uiHints?: Record<
    string,
    {
      widget: string;
      label?: string;
      description?: string;
      dependsOn?: string[];
      supportsSuggestions?: boolean;
      min?: number;
      max?: number;
    }
  >;
  themeOptions?: Record<string, string>;
  samples?: string[];
  promptTemplate: string;
  defaults?: Record<string, unknown>;
  titleTemplate?: string;
  descriptionTemplate?: string;
  tags?: string[];
  model?: string;
  size?: string;
  output_format?: string;
  background?: string;
}

const templateSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional(),
  paramsSchema: z.record(z.any()),
  uiHints: z.record(z.any()).optional(),
  themeOptions: z.record(z.string()).optional(),
  samples: z.array(z.string().min(1)).optional(),
  promptTemplate: z.string().min(1),
  defaults: z.record(z.any()).optional(),
  titleTemplate: z.string().optional(),
  descriptionTemplate: z.string().optional(),
  tags: z.array(z.string()).optional(),
  model: z.string().optional(),
  size: z.string().optional(),
  output_format: z.string().optional(),
  background: z.string().optional(),
});

const listSchema = z.array(templateSchema);

function getTemplatesPath() {
  const here = path.dirname(fileURLToPath(import.meta.url));
  return path.join(here, "..", "data", "prompt-templates.json");
}

async function readTemplatesFile(): Promise<PromptTemplate[]> {
  const raw = await fs.readFile(getTemplatesPath(), "utf8");
  const parsed = JSON.parse(raw);
  const data = listSchema.parse(parsed);
  const templates = data as PromptTemplate[];
  for (const template of templates) {
    assertTemplateSafe(template);
  }
  return templates;
}

async function getTemplatesCacheVersion() {
  try {
    const stat = await fs.stat(getTemplatesPath());
    return String(stat.mtimeMs);
  } catch {
    return "0";
  }
}

export interface TemplateStore {
  listTemplates(): Promise<PromptTemplate[]>;
  getTemplate(id: string): Promise<PromptTemplate | null>;
}

export class JsonTemplateStore implements TemplateStore {
  async listTemplates() {
    const redis = getRedis();
    const version = await getTemplatesCacheVersion();
    const cacheKey = `templates:list:${version}`;
    if (redis) {
      const cached = await redis.get(cacheKey);
      if (cached) return JSON.parse(cached) as PromptTemplate[];
    }

    const templates = await readTemplatesFile();
    if (redis) {
      await redis.set(cacheKey, JSON.stringify(templates), "EX", 600);
    }
    return templates;
  }

  async getTemplate(id: string) {
    const redis = getRedis();
    const version = await getTemplatesCacheVersion();
    const cacheKey = `templates:${id}:${version}`;
    if (redis) {
      const cached = await redis.get(cacheKey);
      if (cached) return JSON.parse(cached) as PromptTemplate;
    }
    const templates = await this.listTemplates();
    const template = templates.find((item) => item.id === id) ?? null;
    if (redis && template) {
      await redis.set(cacheKey, JSON.stringify(template), "EX", 600);
    }
    return template;
  }
}

function stringSchema(def: TemplateParamSchema & { type: "string" }) {
  let schema = z.string();
  if (def.enum?.length) schema = schema.refine((val) => def.enum?.includes(val));
  if (def.min) schema = schema.min(def.min);
  if (def.max) schema = schema.max(def.max);
  if (def.regex) schema = schema.regex(new RegExp(def.regex));
  return schema;
}

export function buildParamsSchema(paramsSchema: Record<string, TemplateParamSchema>) {
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const [key, def] of Object.entries(paramsSchema)) {
    if (def.type === "string") {
      shape[key] = stringSchema(def);
      continue;
    }
    if (def.type === "array") {
      const item = stringSchema(def.items);
      let schema = z.array(item);
      if (def.minItems) schema = schema.min(def.minItems);
      if (def.maxItems) schema = schema.max(def.maxItems);
      shape[key] = schema;
      continue;
    }
  }
  return z.object(shape).strict();
}

export function applyDefaults(
  params: Record<string, unknown>,
  defaults?: Record<string, unknown>
) {
  return { ...(defaults ?? {}), ...(params ?? {}) };
}

export function deriveParams(params: Record<string, unknown>) {
  const derived: Record<string, string> = {};
  for (const [key, value] of Object.entries(params)) {
    if (Array.isArray(value)) {
      derived[`${key}Csv`] = value.join(", ");
    }
  }
  return derived;
}

export function renderPrompt(template: string, params: Record<string, unknown>) {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    const value = params[key];
    if (value === undefined || value === null) return "";
    if (Array.isArray(value)) return value.join(", ");
    return String(value);
  });
}

export function assertTemplateSafe(template: PromptTemplate) {
  if (template.themeOptions && Object.keys(template.themeOptions).length === 0) {
    throw new Error(`Template ${template.id} has empty themeOptions`);
  }
  if (/\{\{\w+\}\}/.test(template.promptTemplate)) {
    throw new Error(`Template ${template.id} contains placeholders in promptTemplate`);
  }
  for (const def of Object.values(template.paramsSchema)) {
    if (def.type === "string") {
      if (!def.enum?.length && !def.regex) {
        throw new Error(`Template ${template.id} has unsafe string param`);
      }
    }
    if (def.type === "array") {
      if (def.minItems && def.minItems < 1) {
        throw new Error(`Template ${template.id} has invalid minItems`);
      }
      if (def.maxItems && def.maxItems > 5) {
        throw new Error(`Template ${template.id} exceeds maxItems 5`);
      }
      if (!def.items.regex && !def.items.enum?.length) {
        throw new Error(`Template ${template.id} has unsafe array param`);
      }
    }
  }
}
