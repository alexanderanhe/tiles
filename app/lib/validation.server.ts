import { z } from "zod";

export const registerSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1).max(80),
});

export const sendCodeSchema = z.object({
  email: z.string().email(),
});

export const verifySchema = z.object({
  email: z.string().email(),
  code: z.string().length(6),
});

export const loginSchema = z.object({
  email: z.string().email(),
});

export const tileCreateSchema = z.object({
  title: z.string().max(120).optional().default(""),
  description: z.string().max(1000).optional().default(""),
  tags: z.array(z.string().min(1).max(40)).optional().default([]),
  contentHash: z.string().length(64).optional(),
  replaceExisting: z.boolean().optional().default(false),
  seamless: z.boolean().default(true),
  visibility: z.enum(["public", "unlisted", "private"]).default("public"),
  format: z.string().min(3).max(10).optional(),
});

export const tileUpdateSchema = z.object({
  title: z.string().max(120).optional(),
  description: z.string().max(1000).optional(),
  tags: z.array(z.string().min(1).max(40)).optional(),
  visibility: z.enum(["public", "unlisted", "private"]).optional(),
});

export const tileListSchema = z.object({
  q: z.string().optional().default(""),
  tags: z.string().optional().default(""),
  sort: z.enum(["new", "popular"]).optional().default("new"),
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(60).default(24),
});

export const tileFinalizeSchema = z.object({
  tileId: z.string().min(1),
});

export const signUploadSchema = z.object({
  tileId: z.string().min(1),
  kind: z.enum(["master"]).default("master"),
  contentType: z.string().optional(),
});

export const trackViewSchema = z.object({
  tileId: z.string().min(1),
});

export const trackSearchSchema = z.object({
  q: z.string().optional().default(""),
  tags: z.array(z.string()).optional().default([]),
});

export const adminUpdateUserSchema = z.object({
  role: z.enum(["user", "creator", "admin"]).optional(),
  status: z.enum(["pending", "active", "disabled"]).optional(),
});

export const meUpdateSchema = z.object({
  username: z
    .string()
    .min(3)
    .max(24)
    .regex(/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/)
    .optional(),
  name: z.string().max(80).optional(),
});
