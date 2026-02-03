import type { Route } from "./+types/ai.generate";
import crypto from "node:crypto";

import { json, parseJson, jsonError, jsonOk } from "../../lib/api";
import { requireUser } from "../../lib/auth.server";
import { checkRateLimit } from "../../lib/rateLimit.server";
import { env } from "../../lib/env.server";
import { initServer } from "../../lib/init.server";
import {
  JsonTemplateStore,
  applyDefaults,
  assertTemplateSafe,
  buildParamsSchema,
  deriveParams,
  renderPrompt,
} from "../../lib/templates.server";
import { JsonPromptSourceStore, resolvePromptInput } from "../../lib/prompt-sources.server";
import { getR2PublicUrl, putObject, signDownloadUrl } from "../../lib/r2.client.server";
import { applyWatermark, createThumbnail, getImageMetadata } from "../../lib/watermark.server";
import { createTile, findTileByCacheKey, updateTileR2 } from "../../lib/tiles.server";
import { trackEvent } from "../../lib/events.server";
import { getClientIp, getUserAgent } from "../../lib/request.server";
import { slugify } from "../../lib/slug";

interface GenerateBody {
  templateId: string;
  params?: Record<string, unknown>;
}

function normalizeText(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeHex(color: string) {
  const hex = color.toLowerCase();
  if (hex.length === 4) {
    return (
      "#" +
      hex[1] +
      hex[1] +
      hex[2] +
      hex[2] +
      hex[3] +
      hex[3]
    );
  }
  return hex;
}

function buildCacheKey(input: Record<string, unknown>) {
  const serialized = JSON.stringify(input);
  return crypto.createHash("sha256").update(serialized).digest("hex");
}

export async function action({ request }: Route.ActionArgs) {
  await initServer();
  const user = await requireUser(request, { api: true });
  const rate = await checkRateLimit({
    key: `ai-generate:${user.id}`,
    limit: 10,
    windowMs: 60 * 60 * 1000,
  });
  if (!rate.allowed) return jsonError("Too many requests", 429);

  const body = await parseJson<GenerateBody>(request);
  if (!body?.templateId) return jsonError("templateId required", 400);

  const store = new JsonTemplateStore();
  const template = await store.getTemplate(body.templateId);
  if (!template) return jsonError("Template not found", 404);
  assertTemplateSafe(template);
  const sourceStore = new JsonPromptSourceStore();
  const source = await sourceStore.getSource(template.id);

  const params = applyDefaults(body.params ?? {}, template.defaults);
  const schema = buildParamsSchema(template.paramsSchema);
  const parsed = schema.safeParse(params);
  if (!parsed.success) return jsonError("Invalid params", 400);

  const parsedParams = parsed.data as Record<string, unknown>;
  const hasThemeParams = "themeKey" in parsedParams || "themeText" in parsedParams;
  const shouldUseTheme = Boolean(template.themeOptions) && hasThemeParams;
  let themeKey = "";
  let themeTextInput = "";
  let themeText = "";
  let themeLabel = "";
  if (shouldUseTheme) {
    themeKey = String((parsedParams as Record<string, string>).themeKey ?? "");
    themeTextInput = String(
      (parsedParams as Record<string, string>).themeText ?? ""
    ).trim();
    themeText = themeTextInput || template.themeOptions?.[themeKey] || "";
    if (!themeText) return jsonError("Invalid theme", 400);
    themeLabel = themeTextInput || themeKey;
  }

  for (const value of Object.values(parsed.data)) {
    if (Array.isArray(value) && value.length > 5) {
      return jsonError("Too many colors", 400);
    }
  }

  let safeInput = shouldUseTheme
    ? {
        ...parsedParams,
        themeDescription: themeText,
      }
    : { ...parsedParams };

  if (source) {
    try {
      const resolved = await resolvePromptInput({
        template,
        source,
        params: safeInput,
      });
      safeInput = resolved.safeInput;
    } catch (error) {
      return jsonError(
        error instanceof Error ? error.message : "Failed to resolve params",
        400
      );
    }
  }
  if (!source && template.id === "crayon-seamless-doodle-v2") {
    safeInput = {
      ...safeInput,
      themeLabel: "celebration doodles",
      themeKeywords: "party, balloons, confetti",
    };
  }

  const derived = deriveParams(safeInput);
  const baseInstructions =
    template.id === "crayon-seamless-doodle-v2"
      ? "You must generate a true seamless tile. Edges must match perfectly on all sides. " +
        "No borders, no seams, repeatable pattern. Square format. Flat 2D illustration. " +
        "Crayon/wax pastel doodle style with visible grain and imperfect strokes. " +
        "No gradients, no shadows, no realism. No logos, no watermarks, no signatures. " +
        "No text unless explicitly required by the theme."
      : "";

  const cacheParams = shouldUseTheme
    ? {
        ...parsedParams,
        themeText: normalizeText(themeText),
        backgroundColor: normalizeHex(
          String((parsedParams as Record<string, string>).backgroundColor ?? "")
        ),
        crayonColors: (
          ((parsedParams as Record<string, string[]>).crayonColors ?? []) as string[]
        )
          .map(normalizeHex)
          .sort(),
      }
    : parsedParams;

  const cacheKey = buildCacheKey({
    templateId: template.id,
    model: template.model ?? env.OPENAI_IMAGE_MODEL,
    size: template.size ?? env.OPENAI_IMAGE_SIZE,
    output_format: template.output_format ?? env.OPENAI_IMAGE_OUTPUT_FORMAT,
    background: template.background ?? env.OPENAI_IMAGE_BACKGROUND,
    params: cacheParams,
  });

  const existing = await findTileByCacheKey(cacheKey);
  if (existing) {
    if (existing.ownerId === user.id) {
      const slug = slugify(existing.title ?? "");
      const detailUrl = `/u/${user.username ?? user.id}/${existing._id}${
        slug ? `-${slug}` : ""
      }`;
      const previewUrl = existing.r2.previewKey
        ? getR2PublicUrl(existing.r2.previewKey) ||
          (await signDownloadUrl(existing.r2.previewKey))
        : existing.r2.masterKey
          ? await signDownloadUrl(existing.r2.masterKey)
          : "";
      return jsonOk({ tileId: existing._id, detailUrl, previewUrl, cached: true });
    }
  }

  const promptParts = [baseInstructions, template.promptTemplate].filter(Boolean);
  const prompt = `${promptParts.join("\n")}\nINPUT_JSON=${JSON.stringify(safeInput)}`;

  const model = template.model ?? env.OPENAI_IMAGE_MODEL;
  const size = template.size ?? env.OPENAI_IMAGE_SIZE;
  const output_format = template.output_format ?? env.OPENAI_IMAGE_OUTPUT_FORMAT;
  const background = template.background ?? env.OPENAI_IMAGE_BACKGROUND;
  if (!/^\d+x\d+$/.test(size)) return jsonError("Invalid size", 400);
  const [w, h] = size.split("x").map((v) => Number(v));
  if (w !== h) return jsonError("Size must be square", 400);
  const allowedFormats = new Set(["webp", "png", "jpg"]);
  if (!allowedFormats.has(output_format)) return jsonError("Invalid output format", 400);

  const response = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model,
      prompt,
      size,
      output_format,
      background,
      n: 1,
    }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    return jsonError("OpenAI request failed", 500, { details: error });
  }

  const data = await response.json();
  const b64 = data?.data?.[0]?.b64_json;
  if (!b64) return jsonError("No image returned", 500);

  const buffer = Buffer.from(b64, "base64");
  const tileId = crypto.randomUUID();
  const ext = output_format === "png" ? "png" : output_format === "jpg" ? "jpg" : "webp";
  const masterKey = `tiles/${tileId}/ai.${ext}`;

  await putObject(masterKey, buffer, `image/${ext === "jpg" ? "jpeg" : ext}`);

  const metadata = await getImageMetadata(buffer);
  const preview = await applyWatermark(buffer, 1600);
  const thumb = await applyWatermark(buffer, 400);
  const cleanThumb = await createThumbnail(buffer, 400);

  const previewKey = `tiles/${tileId}/preview.webp`;
  const thumbKey = `tiles/${tileId}/thumb.webp`;
  const thumbCleanKey = `tiles/${tileId}/thumb-clean.webp`;
  await putObject(previewKey, preview.data, "image/webp");
  await putObject(thumbKey, thumb.data, "image/webp");
  await putObject(thumbCleanKey, cleanThumb.data, "image/webp");

  const title = template.titleTemplate
    ? renderPrompt(template.titleTemplate, {
        ...safeInput,
        ...derived,
        themeLabel,
      })
    : `${template.name} — ${String(parsed.data?.theme ?? "AI")}`;
  const description = template.descriptionTemplate
    ? renderPrompt(template.descriptionTemplate, {
        ...safeInput,
        ...derived,
        themeLabel,
      })
    : template.description ?? "AI generated seamless tile";
  const tagList = template.tags?.length
    ? template.tags.map((tag) =>
        renderPrompt(tag, { ...safeInput, ...derived, themeLabel })
      )
    : [String(parsed.data?.theme ?? "ai")];
  if (existing && existing.ownerId !== user.id) {
    const cloneId = crypto.randomUUID();
    const clone = await createTile({
      id: cloneId,
      ownerId: user.id,
      templateId: template.id,
      title,
      description,
      tags: tagList,
      seamless: true,
      visibility: "private",
      format: existing.format,
      masterKey: existing.r2.masterKey,
      meta: {
        generatedBy: "openai",
        templateId: template.id,
        params: parsed.data,
        cacheKey,
        sourceTileId: existing._id,
      },
    });
    await updateTileR2(
      cloneId,
      { ...existing.r2 },
      {
        width: existing.width,
        height: existing.height,
        format: existing.format,
      }
    );

    const slug = slugify(clone.title ?? "");
    const detailUrl = `/u/${user.username ?? user.id}/${clone._id}${
      slug ? `-${slug}` : ""
    }`;
    const previewUrl = existing.r2.previewKey
      ? getR2PublicUrl(existing.r2.previewKey) ||
        (await signDownloadUrl(existing.r2.previewKey))
      : existing.r2.masterKey
        ? await signDownloadUrl(existing.r2.masterKey)
        : "";
    return jsonOk({ tileId: clone._id, detailUrl, previewUrl, cached: true });
  }

  const tile = await createTile({
    id: tileId,
    ownerId: user.id,
    templateId: template.id,
    title,
    description,
    tags: tagList,
    seamless: true,
    visibility: "private",
    format: ext,
    masterKey,
    meta: {
      generatedBy: "openai",
      templateId: template.id,
      params: parsed.data,
      cacheKey,
    },
  });

  await updateTileR2(
    tileId,
    {
      masterKey,
      previewKey,
      thumbKey,
      thumbCleanKey,
      sizeBytes: buffer.length,
      etag: undefined,
    },
    {
      width: metadata.width,
      height: metadata.height,
      format: metadata.format,
    }
  );

  await trackEvent({
    type: "upload",
    userId: user.id,
    tileId,
    ip: getClientIp(request),
    userAgent: getUserAgent(request),
    meta: { generatedBy: "openai", templateId: template.id },
  });

  await trackEvent({
    type: "ai_generate",
    userId: user.id,
    tileId,
    ip: getClientIp(request),
    userAgent: getUserAgent(request),
    meta: { templateId: template.id, model },
  });

  const publicPreview = getR2PublicUrl(previewKey);
  const previewUrl = publicPreview || (await signDownloadUrl(previewKey));

  const slug = slugify(title);
  return jsonOk({
    tileId,
    detailUrl: `/u/${user.username ?? user.id}/${tileId}${slug ? `-${slug}` : ""}`,
    previewUrl,
  });
}

export function loader() {
  return json({ ok: false, error: "Method not allowed" }, { status: 405 });
}
