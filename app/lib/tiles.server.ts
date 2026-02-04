import crypto from "node:crypto";
import { getCollections } from "./db.server";
import type { Tile, TileVisibility } from "./types";

export function normalizeTags(tags: string[] = []) {
  const seen = new Set<string>();
  const clean: string[] = [];
  for (const rawTag of tags) {
    const tag = String(rawTag ?? "").trim();
    if (!tag) continue;
    const key = tag.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    clean.push(tag);
  }
  return clean;
}

export async function createTile(params: {
  id?: string;
  ownerId: string;
  templateId?: string;
  title: string;
  description?: string;
  tags?: string[];
  contentHash?: string;
  seamless?: boolean;
  visibility?: TileVisibility;
  format?: string;
  masterKey?: string;
  meta?: Record<string, unknown>;
}) {
  const { tiles } = await getCollections();
  const now = new Date();
  const tile: Tile = {
    _id: params.id ?? crypto.randomUUID(),
    ownerId: params.ownerId,
    templateId: params.templateId,
    title: params.title,
    description: params.description ?? "",
    tags: normalizeTags(params.tags ?? []),
    contentHash: params.contentHash,
    seamless: params.seamless ?? true,
    visibility: params.visibility ?? "public",
    format: params.format,
    r2: {
      masterKey: params.masterKey ?? "",
    },
    meta: params.meta,
    createdAt: now,
    updatedAt: now,
    stats: { views: 0, downloads: 0 },
  };
  await tiles.insertOne(tile);
  return tile;
}

export async function findTileByContentHash(ownerId: string, contentHash: string) {
  const { tiles } = await getCollections();
  return tiles.findOne({ ownerId, contentHash });
}

export async function findTileByContentHashGlobal(contentHash: string) {
  const { tiles } = await getCollections();
  return tiles.findOne({ contentHash });
}

export async function findTileByCacheKey(cacheKey: string) {
  const { tiles } = await getCollections();
  return tiles.findOne({ "meta.cacheKey": cacheKey });
}

export async function updateTileR2(id: string, r2: Tile["r2"], meta: Partial<Tile>) {
  const { tiles } = await getCollections();
  await tiles.updateOne(
    { _id: id },
    { $set: { r2, ...meta, updatedAt: new Date() } }
  );
}

export async function findTileById(id: string) {
  const { tiles } = await getCollections();
  return tiles.findOne({ _id: id });
}

export async function listTiles(params: {
  q?: string;
  tags?: string[];
  sort?: "new" | "popular";
  page?: number;
  limit?: number;
  visibility?: TileVisibility[];
  ownerId?: string;
  ai?: "only" | "exclude";
}) {
  const { tiles } = await getCollections();
  const query: Record<string, unknown> = {};
  const andFilters: Record<string, unknown>[] = [];

  if (params.visibility?.length) {
    query.visibility = { $in: params.visibility };
  }

  if (params.tags?.length) {
    query.tags = { $in: params.tags };
  }

  if (params.q) {
    const escaped = params.q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern = new RegExp(escaped, "i");
    andFilters.push({
      $or: [{ title: pattern }, { description: pattern }, { tags: pattern }],
    });
  }

  if (params.ownerId) {
    query.ownerId = params.ownerId;
  }

  if (params.ai === "only") {
    andFilters.push({
      $or: [
        { templateId: { $exists: true, $ne: null } },
        { "meta.aiGenerated": true },
      ],
    });
  } else if (params.ai === "exclude") {
    andFilters.push({
      $nor: [
        { templateId: { $exists: true, $ne: null } },
        { "meta.aiGenerated": true },
      ],
    });
  }

  if (andFilters.length) {
    query.$and = andFilters;
  }

  const page = params.page ?? 1;
  const limit = params.limit ?? 24;
  const sort =
    params.sort === "popular"
      ? { "stats.downloads": -1, "stats.views": -1, createdAt: -1 }
      : { createdAt: -1 };

  const items = await tiles
    .find(query)
    .sort(sort)
    .skip((page - 1) * limit)
    .limit(limit)
    .toArray();

  const total = await tiles.countDocuments(query);
  return { items, total };
}

export async function listTopTags(params: { limit?: number } = {}) {
  const { tiles } = await getCollections();
  const limit = params.limit ?? 6;
  const result = await tiles
    .aggregate<{ _id: string; count: number }>([
      { $match: { visibility: "public", tags: { $exists: true, $ne: [] } } },
      { $unwind: "$tags" },
      { $match: { tags: { $type: "string", $ne: "" } } },
      { $group: { _id: "$tags", count: { $sum: 1 } } },
      { $sort: { count: -1, _id: 1 } },
      { $limit: limit },
    ])
    .toArray();
  return result.map((row) => row._id);
}

export async function incrementTileStats(id: string, field: "views" | "downloads") {
  const { tiles } = await getCollections();
  await tiles.updateOne({ _id: id }, { $inc: { [`stats.${field}`]: 1 } });
}

export async function updateTileMeta(id: string, data: Partial<Tile>) {
  const { tiles } = await getCollections();
  await tiles.updateOne(
    { _id: id },
    { $set: { ...data, updatedAt: new Date() } }
  );
}

export async function deleteTileById(id: string) {
  const { tiles } = await getCollections();
  return tiles.deleteOne({ _id: id });
}
