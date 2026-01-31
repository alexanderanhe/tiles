export function json<T>(data: T, init?: ResponseInit) {
  const headers = new Headers(init?.headers);
  if (!headers.has("content-type")) {
    headers.set("content-type", "application/json; charset=utf-8");
  }
  return new Response(JSON.stringify(data), { ...init, headers });
}

export async function parseJson<T>(request: Request): Promise<T> {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    throw json({ error: "Expected JSON body" }, { status: 415 });
  }
  return request.json() as Promise<T>;
}

export function jsonOk<T>(data: T, init?: ResponseInit) {
  return json({ ok: true, ...data }, init);
}

export function jsonError(message: string, status = 400, extra?: Record<string, unknown>) {
  return json({ ok: false, error: message, ...extra }, { status });
}
