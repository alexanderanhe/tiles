import { getRedis } from "./redis.server";

const memoryStore = new Map<
  string,
  { count: number; resetAt: number }
>();

interface RateLimitOptions {
  key: string;
  limit: number;
  windowMs: number;
}

export async function checkRateLimit({ key, limit, windowMs }: RateLimitOptions) {
  const redis = getRedis();
  const now = Date.now();

  if (redis) {
    const redisKey = `ratelimit:${key}`;
    const tx = redis.multi();
    tx.incr(redisKey);
    tx.pttl(redisKey);
    const [countResult, ttlResult] = await tx.exec();
    const count = Number(countResult[1] ?? 0);
    const ttl = Number(ttlResult[1] ?? -1);

    if (ttl < 0) {
      await redis.pexpire(redisKey, windowMs);
    }

    const remaining = Math.max(0, limit - count);
    return {
      allowed: count <= limit,
      remaining,
      resetAt: now + (ttl > 0 ? ttl : windowMs),
    };
  }

  const entry = memoryStore.get(key);
  if (!entry || entry.resetAt <= now) {
    memoryStore.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: limit - 1, resetAt: now + windowMs };
  }

  entry.count += 1;
  memoryStore.set(key, entry);
  return {
    allowed: entry.count <= limit,
    remaining: Math.max(0, limit - entry.count),
    resetAt: entry.resetAt,
  };
}
