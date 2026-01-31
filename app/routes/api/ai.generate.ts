import type { Route } from "./+types/ai.generate";
import crypto from "node:crypto";

import { json, parseJson, jsonError, jsonOk } from "../../lib/api.server";
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
import { getR2PublicUrl, putObject, signDownloadUrl } from "../../lib/r2.client.server";
import { applyWatermark, getImageMetadata } from "../../lib/watermark.server";
import { createTile, updateTileR2 } from "../../lib/tiles.server";
import { trackEvent } from "../../lib/events.server";
import { getClientIp, getUserAgent } from "../../lib/request.server";

interface GenerateBody {
  templateId: string;
  params?: Record<string, unknown>;
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

  const params = applyDefaults(body.params ?? {}, template.defaults);
  const schema = buildParamsSchema(template.paramsSchema);
  const parsed = schema.safeParse(params);
  if (!parsed.success) return jsonError("Invalid params", 400);

  const themeKey = (parsed.data as Record<string, string>).themeKey;
  const themeText = template.themeOptions?.[themeKey];
  if (!themeText) return jsonError("Invalid theme", 400);

  for (const value of Object.values(parsed.data)) {
    if (Array.isArray(value) && value.length > 5) {
      return jsonError("Too many colors", 400);
    }
  }

  const derived = deriveParams(parsed.data);
  const baseInstructions =
    "You must generate a true seamless tile. Edges must match perfectly on all sides. " +
    "No borders, no seams, repeatable pattern. Square format. Flat 2D illustration. " +
    "Crayon/wax pastel doodle style with visible grain and imperfect strokes. " +
    "No gradients, no shadows, no realism. No logos, no watermarks, no signatures. " +
    "No text unless explicitly required by the theme.";
  const safeInput = {
    themeKey,
    themeDescription: themeText,
    backgroundColor: (parsed.data as Record<string, string>).backgroundColor,
    crayonColors: (parsed.data as Record<string, string[]>).crayonColors,
  };

  const prompt =
    baseInstructions +
    "\n" +
    template.promptTemplate +
    "\nINPUT_JSON=" +
    JSON.stringify(safeInput);

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

  const previewKey = `tiles/${tileId}/preview.webp`;
  const thumbKey = `tiles/${tileId}/thumb.webp`;
  await putObject(previewKey, preview.data, "image/webp");
  await putObject(thumbKey, thumb.data, "image/webp");

  const title = template.titleTemplate
    ? renderPrompt(template.titleTemplate, { ...parsed.data, ...derived })
    : `${template.name} — ${String(parsed.data?.theme ?? "AI")}`;
  const description = template.descriptionTemplate
    ? renderPrompt(template.descriptionTemplate, { ...parsed.data, ...derived })
    : template.description ?? "AI generated seamless tile";
  const tagList = template.tags?.length
    ? template.tags.map((tag) =>
        renderPrompt(tag, { ...parsed.data, ...derived })
      )
    : [String(parsed.data?.theme ?? "ai")];
  const tile = await createTile({
    id: tileId,
    ownerId: user.id,
    title,
    description,
    tags: tagList,
    seamless: true,
    visibility: "public",
    format: ext,
    masterKey,
    meta: { generatedBy: "openai", templateId: template.id, params: parsed.data },
  });

  await updateTileR2(
    tileId,
    {
      masterKey,
      previewKey,
      thumbKey,
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

  return jsonOk({
    tileId,
    detailUrl: `/tiles/${tileId}`,
    previewUrl,
  });
}

export function loader() {
  return json({ ok: false, error: "Method not allowed" }, { status: 405 });
}
