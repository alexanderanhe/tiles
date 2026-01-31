import type { Route } from "./+types/auth.login";

import { initServer } from "../../lib/init.server";
import { json, parseJson, jsonError, jsonOk } from "../../lib/api";
import { loginSchema } from "../../lib/validation.server";
import { checkRateLimit } from "../../lib/rateLimit.server";
import { createEmailVerification } from "../../lib/verification.server";
import { sendVerificationEmail } from "../../lib/resend.server";
import { findUserByEmail, updateUserRoleStatus } from "../../lib/users.server";
import { commitUserSession } from "../../lib/auth.server";
import { getClientIp, getUserAgent } from "../../lib/request.server";
import { trackEvent } from "../../lib/events.server";

export async function action({ request }: Route.ActionArgs) {
  await initServer();
  const body = await parseJson(request);
  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) return jsonError("Invalid input", 400);

  const { email } = parsed.data;
  const ip = getClientIp(request);
  const rate = await checkRateLimit({
    key: `login:${ip}:${email}`,
    limit: 6,
    windowMs: 10 * 60 * 1000,
  });
  if (!rate.allowed) return jsonError("Too many requests", 429);

  const user = await findUserByEmail(email);
  if (!user) return jsonError("User not found", 404);
  if (user.status === "disabled") return jsonError("Account disabled", 403);
  if (user.role === "user") {
    await updateUserRoleStatus(user._id, { role: "creator" });
  }
  if (user.status === "active") {
    const cookie = await commitUserSession({
      id: user._id,
      email: user.email,
      role: user.role,
      status: user.status,
      name: user.name,
      username: user.username,
    });
    return jsonOk({ user }, { headers: { "Set-Cookie": cookie } });
  }

  const code = await createEmailVerification(email);
  await sendVerificationEmail(email, code);
  await trackEvent({
    type: "verify_sent",
    userId: user._id,
    ip,
    userAgent: getUserAgent(request),
  });

  return jsonOk({ message: "Verification code sent" });
}

export function loader() {
  return json({ ok: false, error: "Method not allowed" }, { status: 405 });
}
