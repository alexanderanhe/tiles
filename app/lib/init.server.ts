import { ensureIndexes } from "./db.server";

let initialized = false;

export async function initServer() {
  if (initialized) return;
  await ensureIndexes();
  initialized = true;
}
