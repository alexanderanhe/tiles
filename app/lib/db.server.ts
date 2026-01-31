import { MongoClient, type Db } from "mongodb";
import { env } from "./env.server";
import type { EmailVerification, Event, Tile, User } from "./types";

let clientPromise: Promise<MongoClient> | null = null;
let dbPromise: Promise<Db> | null = null;

function getClient(): Promise<MongoClient> {
  if (!clientPromise) {
    const client = new MongoClient(env.MONGODB_URI);
    clientPromise = client.connect();
  }
  return clientPromise;
}

export async function getDb(): Promise<Db> {
  if (!dbPromise) {
    dbPromise = getClient().then((client) => client.db(env.MONGODB_DB));
  }
  return dbPromise;
}

export async function getCollections() {
  const db = await getDb();
  return {
    users: db.collection<User>("users"),
    emailVerifications: db.collection<EmailVerification>("email_verifications"),
    tiles: db.collection<Tile>("tiles"),
    events: db.collection<Event>("events"),
  };
}

let indexesEnsured = false;

export async function ensureIndexes() {
  if (indexesEnsured) return;
  const { users, emailVerifications, tiles, events } = await getCollections();

  await users.createIndex({ email: 1 }, { unique: true });
  await users.createIndex({ role: 1, status: 1 });

  await emailVerifications.createIndex({ email: 1 });
  await emailVerifications.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });

  await tiles.createIndex({ ownerId: 1, createdAt: -1 });
  await tiles.createIndex({ visibility: 1, createdAt: -1 });
  await tiles.createIndex({ tags: 1 });
  await tiles.createIndex({ title: "text", description: "text", tags: "text" });

  await events.createIndex({ tileId: 1, createdAt: -1 });
  await events.createIndex({ userId: 1, createdAt: -1 });
  await events.createIndex({ type: 1, createdAt: -1 });

  indexesEnsured = true;
}
