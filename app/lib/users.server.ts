import crypto from "node:crypto";
import { getCollections } from "./db.server";
import type { User, UserRole, UserStatus } from "./types";

function unwrapResult<T>(result: T | { value?: T } | null | undefined) {
  if (!result) return null;
  if (typeof result === "object" && "value" in result) {
    return (result as { value?: T }).value ?? null;
  }
  return result as T;
}

export async function createUser(params: {
  email: string;
  name?: string;
  role?: UserRole;
  username?: string;
}) {
  const { users } = await getCollections();
  const now = new Date();
  const user: User = {
    _id: crypto.randomUUID(),
    email: params.email.toLowerCase(),
    name: params.name?.trim(),
    username: params.username?.trim(),
    role: params.role ?? "creator",
    status: "pending",
    createdAt: now,
    updatedAt: now,
  };
  await users.insertOne(user);
  return user;
}

export async function findUserByEmail(email: string) {
  const { users } = await getCollections();
  return users.findOne({ email: email.toLowerCase() });
}

export async function findUserById(id: string) {
  const { users } = await getCollections();
  return users.findOne({ _id: id });
}

export async function findUserByName(name: string) {
  const { users } = await getCollections();
  return users.findOne({ name });
}

export async function findUserByUsername(username: string) {
  const { users } = await getCollections();
  return users.findOne({ username: username.toLowerCase() });
}

export async function findUserByHandle(handle: string) {
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    handle
  );
  if (isUuid) {
    const byId = await findUserById(handle);
    if (byId) return byId;
  }
  const byUsername = await findUserByUsername(handle.toLowerCase());
  if (byUsername) return byUsername;
  return isUuid ? null : findUserById(handle);
}

export async function findUsersByIds(ids: string[]) {
  if (!ids.length) return [];
  const { users } = await getCollections();
  return users.find({ _id: { $in: ids } }).toArray();
}

export async function generateUniqueUsername(base: string) {
  const baseSlug = base
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "")
    .slice(0, 20);
  const fallback = baseSlug || "user";
  const existing = await findUserByUsername(fallback);
  if (!existing) return fallback;
  const suffix = Math.floor(1000 + Math.random() * 9000);
  return `${fallback}-${suffix}`;
}

export async function activateUser(email: string) {
  const { users } = await getCollections();
  const now = new Date();
  const result = await users.findOneAndUpdate(
    { email: email.toLowerCase() },
    { $set: { status: "active", updatedAt: now, lastLoginAt: now } },
    { returnDocument: "after" }
  );
  return unwrapResult(result);
}

export async function activateUserById(id: string) {
  const { users } = await getCollections();
  const now = new Date();
  const result = await users.findOneAndUpdate(
    { _id: id },
    { $set: { status: "active", updatedAt: now, lastLoginAt: now } },
    { returnDocument: "after" }
  );
  return unwrapResult(result);
}

export async function upsertActiveUser(email: string, name?: string, username?: string) {
  const { users } = await getCollections();
  const now = new Date();
  const normalizedEmail = email.toLowerCase();
  const derivedUsername =
    username ??
    (name
      ? await generateUniqueUsername(name)
      : await generateUniqueUsername(normalizedEmail.split("@")[0]));
  const result = await users.findOneAndUpdate(
    { email: normalizedEmail },
    {
      $setOnInsert: {
        _id: crypto.randomUUID(),
        email: normalizedEmail,
        name: name?.trim(),
        username: derivedUsername,
        role: "creator",
        createdAt: now,
      },
      $set: { status: "active", updatedAt: now, lastLoginAt: now },
    },
    { returnDocument: "after", upsert: true }
  );
  return unwrapResult(result);
}

export async function updateUserProfile(
  id: string,
  updates: Partial<Pick<User, "name" | "username">>
) {
  const { users } = await getCollections();
  const result = await users.findOneAndUpdate(
    { _id: id },
    { $set: { ...updates, updatedAt: new Date() } },
    { returnDocument: "after" }
  );
  return unwrapResult(result);
}

export async function updateUserRoleStatus(
  id: string,
  updates: Partial<Pick<User, "role" | "status">>
) {
  const { users } = await getCollections();
  const result = await users.findOneAndUpdate(
    { _id: id },
    { $set: { ...updates, updatedAt: new Date() } },
    { returnDocument: "after" }
  );
  return unwrapResult(result);
}

export async function updateLastLogin(id: string) {
  const { users } = await getCollections();
  await users.updateOne({ _id: id }, { $set: { lastLoginAt: new Date() } });
}

export async function listUsers() {
  const { users } = await getCollections();
  return users.find().sort({ createdAt: -1 }).limit(200).toArray();
}

export async function setUserStatus(id: string, status: UserStatus) {
  const { users } = await getCollections();
  await users.updateOne({ _id: id }, { $set: { status } });
}
