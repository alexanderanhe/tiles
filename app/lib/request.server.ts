export function getClientIp(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return request.headers.get("x-real-ip") ?? "";
}

export function getUserAgent(request: Request) {
  return request.headers.get("user-agent") ?? "";
}
