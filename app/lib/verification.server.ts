import crypto from "node:crypto";
import { getCollections } from "./db.server";
import type { EmailVerification } from "./types";

const CODE_TTL_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 5;

function hashCode(code: string) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto
    .createHash("sha256")
    .update(`${salt}:${code}`)
    .digest("hex");
  return `${salt}:${hash}`;
}

function verifyCodeHash(code: string, codeHash: string) {
  const [salt, hash] = codeHash.split(":");
  if (!salt || !hash) return false;
  const computed = crypto
    .createHash("sha256")
    .update(`${salt}:${code}`)
    .digest("hex");
  return crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(computed));
}

export async function createEmailVerification(email: string) {
  const { emailVerifications } = await getCollections();
  const normalizedEmail = email.toLowerCase();
  const code = `${Math.floor(100000 + Math.random() * 900000)}`;
  const codeHash = hashCode(code);
  const doc: EmailVerification = {
    _id: crypto.randomUUID(),
    email: normalizedEmail,
    codeHash,
    attempts: 0,
    createdAt: new Date(),
    expiresAt: new Date(Date.now() + CODE_TTL_MS),
  };
  await emailVerifications.insertOne(doc);
  return code;
}

export async function verifyEmailCode(email: string, code: string) {
  const { emailVerifications } = await getCollections();
  const normalizedEmail = email.toLowerCase();
  const record = await emailVerifications.findOne(
    { email: normalizedEmail },
    { sort: { createdAt: -1 } }
  );
  if (!record) return { ok: false, reason: "not_found" } as const;

  if (record.expiresAt.getTime() < Date.now()) {
    await emailVerifications.deleteOne({ _id: record._id });
    return { ok: false, reason: "expired" } as const;
  }

  if (record.attempts >= MAX_ATTEMPTS) {
    return { ok: false, reason: "locked" } as const;
  }

  const matches = verifyCodeHash(code, record.codeHash);
  if (!matches) {
    await emailVerifications.updateOne(
      { _id: record._id },
      { $inc: { attempts: 1 } }
    );
    return { ok: false, reason: "invalid" } as const;
  }

  await emailVerifications.deleteOne({ _id: record._id });
  return { ok: true } as const;
}
