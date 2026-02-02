import type { Route } from "./+types/auth.verify";

import { initServer } from "../../lib/init.server";
import { json, parseJson, jsonError, jsonOk } from "../../lib/api";
import { verifySchema } from "../../lib/validation.server";
import { checkRateLimit } from "../../lib/rateLimit.server";
import { verifyEmailCode } from "../../lib/verification.server";
import {
  upsertActiveUser,
  findUserByEmail,
  updateUserRoleStatus,
  setUserPassword,
} from "../../lib/users.server";
import { commitUserSession } from "../../lib/auth.server";
import { getClientIp, getUserAgent } from "../../lib/request.server";
import { trackEvent } from "../../lib/events.server";

export async function action({ request }: Route.ActionArgs) {
  await initServer();
  const body = await parseJson(request);
  const parsed = verifySchema.safeParse(body);
  if (!parsed.success) return jsonError("Invalid input", 400);

  const email = parsed.data.email.trim();
  const { code } = parsed.data;
  const ip = getClientIp(request);
  const rate = await checkRateLimit({
    key: `verify:${ip}:${email}`,
    limit: 8,
    windowMs: 10 * 60 * 1000,
  });
  if (!rate.allowed) return jsonError("Too many requests", 429);

  const result = await verifyEmailCode(email, code);
  if (!result.ok) {
    return jsonError("Invalid or expired code", 400, { reason: result.reason });
  }

  const user = await findUserByEmail(email);
  if (user?.status === "disabled") return jsonError("Account disabled", 403);
  if (user && user.role === "user") {
    await updateUserRoleStatus(user._id, { role: "creator" });
  }

  const fallbackName = email.split("@")[0];
  const activeUser = await upsertActiveUser(
    email,
    user?.name ?? fallbackName,
    user?.username
  );
  console.log("Active user:", activeUser);
  if (!activeUser) return jsonError("User not found", 404);
  await setUserPassword(activeUser._id, parsed.data.password);

  await trackEvent({
    type: "verify_success",
    userId: activeUser._id,
    ip,
    userAgent: getUserAgent(request),
  });

  const cookie = await commitUserSession({
    id: activeUser._id,
    email: activeUser.email,
    role: activeUser.role,
    status: activeUser.status,
    name: activeUser.name,
    username: activeUser.username,
  });

  return jsonOk({ user: activeUser }, { headers: { "Set-Cookie": cookie } });
}

export function loader() {
  return json({ ok: false, error: "Method not allowed" }, { status: 405 });
}
