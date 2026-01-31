import crypto from "node:crypto";
import { getCollections } from "./db.server";
import type { EventType } from "./types";

export function hashIp(ip: string) {
  return crypto.createHash("sha256").update(ip).digest("hex");
}

export async function trackEvent(params: {
  type: EventType;
  userId?: string;
  tileId?: string;
  ip?: string | null;
  userAgent?: string | null;
  meta?: Record<string, unknown>;
}) {
  const { events } = await getCollections();
  await events.insertOne({
    _id: crypto.randomUUID(),
    type: params.type,
    userId: params.userId,
    tileId: params.tileId,
    ipHash: params.ip ? hashIp(params.ip) : undefined,
    userAgent: params.userAgent ?? undefined,
    meta: params.meta ?? undefined,
    createdAt: new Date(),
  });
}
