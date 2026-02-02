import crypto from "node:crypto";
import { getCollections } from "./db.server";
import type { Tile, TileVisibility } from "./types";

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
    tags: params.tags ?? [],
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
}) {
  const { tiles } = await getCollections();
  const query: Record<string, unknown> = {};

  if (params.visibility?.length) {
    query.visibility = { $in: params.visibility };
  }

  if (params.tags?.length) {
    query.tags = { $in: params.tags };
  }

  if (params.q) {
    query.$text = { $search: params.q };
  }

  if (params.ownerId) {
    query.ownerId = params.ownerId;
  }

  const page = params.page ?? 1;
  const limit = params.limit ?? 24;
  const sort =
    params.sort === "popular"
      ? { "stats.downloads": -1, createdAt: -1 }
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
