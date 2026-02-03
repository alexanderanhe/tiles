import assert from "node:assert/strict";
import test from "node:test";

function setTestEnv() {
  process.env.MONGODB_URI = "mongodb://localhost:27017";
  process.env.MONGODB_DB = "test";
  process.env.R2_ACCOUNT_ID = "test";
  process.env.R2_ACCESS_KEY_ID = "test";
  process.env.R2_SECRET_ACCESS_KEY = "test";
  process.env.R2_BUCKET = "test";
  process.env.RESEND_API_KEY = "test";
  process.env.RESEND_FROM_EMAIL = "test@example.com";
  process.env.APP_BASE_URL = "http://localhost";
  process.env.JWT_SECRET = "test-secret-test-secret-test-secret";
  process.env.WATERMARK_TEXT = "test";
  process.env.OPENAI_API_KEY = "test";
}

setTestEnv();

test("template without source returns static options", async () => {
  const { resolvePromptOptions } = await import("../app/lib/prompt-sources.server.ts");
  const template = {
    id: "static-template",
    name: "Static Template",
    paramsSchema: {
      cityName: { type: "string", enum: ["Paris", "Tokyo"] },
    },
    promptTemplate: "INPUT_JSON only",
  };

  const result = await resolvePromptOptions({ template, source: null });
  assert.deepEqual(result.options.cityName, [
    { id: "Paris", label: "Paris" },
    { id: "Tokyo", label: "Tokyo" },
  ]);
});

test("template with source returns dynamic options", async () => {
  const { resolvePromptOptions } = await import("../app/lib/prompt-sources.server.ts");
  const template = {
    id: "dynamic-template",
    name: "Dynamic Template",
    paramsSchema: {
      cityId: { type: "string", regex: "^Q[0-9]+$" },
    },
    promptTemplate: "INPUT_JSON only",
  };
  const source = {
    id: "dynamic-template",
    provider: "static",
    paramProviders: {
      cityId: {
        type: "static",
        options: [
          { id: "Q90", label: "Paris" },
          { id: "Q1490", label: "Tokyo" },
        ],
      },
    },
  };

  const result = await resolvePromptOptions({ template, source });
  assert.deepEqual(result.options.cityId, [
    { id: "Q90", label: "Paris" },
    { id: "Q1490", label: "Tokyo" },
  ]);
});

test("invalid ids are rejected by schema validation", async () => {
  const { buildParamsSchema } = await import("../app/lib/templates.server.ts");
  const schema = buildParamsSchema({
    cityId: { type: "string", regex: "^Q[0-9]+$" },
  });
  const parsed = schema.safeParse({ cityId: "Paris" });
  assert.equal(parsed.success, false);
});

test("labels are sanitized before prompt injection", async () => {
  const { resolvePromptInput } = await import("../app/lib/prompt-sources.server.ts");
  const template = {
    id: "sanitize-template",
    name: "Sanitize Template",
    paramsSchema: {
      cityId: { type: "string", regex: "^Q[0-9]+$" },
    },
    promptTemplate: "INPUT_JSON only",
  };
  const source = {
    id: "sanitize-template",
    provider: "static",
    sanitization: { maxLength: 20 },
    paramProviders: {
      cityId: {
        type: "static",
        options: [{ id: "Q1", label: "Paris\nCity💥" }],
        labelKey: "cityLabel",
      },
    },
    entityResolver: { provider: "static" },
  };

  const result = await resolvePromptInput({
    template,
    source,
    params: { cityId: "Q1" },
  });

  assert.equal(result.safeInput.cityLabel, "Paris City");
});
