import type { Route } from "./+types/auth.send-code";

import { initServer } from "../../lib/init.server";
import { json, parseJson, jsonError, jsonOk } from "../../lib/api.server";
import { sendCodeSchema } from "../../lib/validation.server";
import { checkRateLimit } from "../../lib/rateLimit.server";
import { createEmailVerification } from "../../lib/verification.server";
import { sendVerificationEmail } from "../../lib/resend.server";
import { findUserByEmail } from "../../lib/users.server";
import { getClientIp, getUserAgent } from "../../lib/request.server";
import { trackEvent } from "../../lib/events.server";

export async function action({ request }: Route.ActionArgs) {
  await initServer();
  const body = await parseJson(request);
  const parsed = sendCodeSchema.safeParse(body);
  if (!parsed.success) return jsonError("Invalid input", 400);

  const { email } = parsed.data;
  const ip = getClientIp(request);
  const rate = await checkRateLimit({
    key: `send-code:${ip}:${email}`,
    limit: 6,
    windowMs: 10 * 60 * 1000,
  });
  if (!rate.allowed) return jsonError("Too many requests", 429);

  const user = await findUserByEmail(email);
  if (!user) return jsonError("User not found", 404);
  if (user.status === "disabled") return jsonError("Account disabled", 403);

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
