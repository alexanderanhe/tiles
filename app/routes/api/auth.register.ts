import type { Route } from "./+types/auth.register";

import { initServer } from "../../lib/init.server";
import { json, parseJson, jsonError, jsonOk } from "../../lib/api.server";
import { registerSchema } from "../../lib/validation.server";
import { checkRateLimit } from "../../lib/rateLimit.server";
import { createEmailVerification } from "../../lib/verification.server";
import { sendVerificationEmail } from "../../lib/resend.server";
import { createUser, findUserByEmail } from "../../lib/users.server";
import { getClientIp, getUserAgent } from "../../lib/request.server";
import { trackEvent } from "../../lib/events.server";

export async function action({ request }: Route.ActionArgs) {
  await initServer();
  const body = await parseJson(request);
  const parsed = registerSchema.safeParse(body);
  if (!parsed.success) return jsonError("Invalid input", 400);

  const { email, name } = parsed.data;
  const ip = getClientIp(request);
  const rate = await checkRateLimit({
    key: `register:${ip}:${email}`,
    limit: 5,
    windowMs: 10 * 60 * 1000,
  });
  if (!rate.allowed) return jsonError("Too many requests", 429);

  let user = await findUserByEmail(email);
  if (user && user.status === "active") {
    return jsonOk({ message: "Account already active", user });
  }

  if (!user) {
    user = await createUser({ email, name });
  }

  if (user.status === "disabled") {
    return jsonError("Account disabled", 403);
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
