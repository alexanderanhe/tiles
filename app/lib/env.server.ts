import { z } from "zod";

const envSchema = z.object({
  MONGODB_URI: z.string().min(1),
  MONGODB_DB: z.string().min(1),
  R2_ACCOUNT_ID: z.string().min(1),
  R2_ACCESS_KEY_ID: z.string().min(1),
  R2_SECRET_ACCESS_KEY: z.string().min(1),
  R2_BUCKET: z.string().min(1),
  R2_PUBLIC_BASE_URL: z.string().optional().default(""),
  RESEND_API_KEY: z.string().min(1),
  RESEND_FROM_EMAIL: z.string().min(1),
  APP_BASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(32),
  REDIS_URL: z.string().optional().default(""),
  WATERMARK_TEXT: z.string().min(1),
  WATERMARK_OPACITY: z.coerce.number().min(0).max(1).default(0.18),
  WATERMARK_SCALE: z.coerce.number().min(0.02).max(0.5).default(0.08),
  DOWNLOAD_REQUIRE_ROLE: z
    .enum(["user", "creator", "admin", "any_authenticated"])
    .default("any_authenticated"),
  OPENAI_API_KEY: z.string().min(1),
  OPENAI_IMAGE_MODEL: z.string().default("gpt-image-1"),
  OPENAI_IMAGE_SIZE: z.string().default("1024x1024"),
  OPENAI_IMAGE_OUTPUT_FORMAT: z.string().default("webp"),
  OPENAI_IMAGE_BACKGROUND: z.string().default("opaque"),
  OPENAI_MAX_IMAGES_PER_REQUEST: z.coerce.number().min(1).max(4).default(1),
  NODE_ENV: z.string().optional().default("development"),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues
    .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
    .join("\n");
  throw new Error(`Invalid environment variables:\n${issues}`);
}

export const env = parsed.data;

export type AppEnv = typeof env;
