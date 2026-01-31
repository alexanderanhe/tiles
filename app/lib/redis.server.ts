import Redis from "ioredis";
import { env } from "./env.server";

let redisClient: Redis | null = null;

export function getRedis() {
  if (!env.REDIS_URL) return null;
  if (!redisClient) {
    redisClient = new Redis(env.REDIS_URL);
  }
  return redisClient;
}
