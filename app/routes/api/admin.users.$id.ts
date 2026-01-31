import type { Route } from "./+types/admin.users.$id";

import { initServer } from "../../lib/init.server";
import { json, parseJson, jsonError, jsonOk } from "../../lib/api";
import { requireUser } from "../../lib/auth.server";
import { adminUpdateUserSchema } from "../../lib/validation.server";
import { updateUserRoleStatus } from "../../lib/users.server";

export async function action({ request, params }: Route.ActionArgs) {
  await initServer();
  const user = await requireUser(request, { api: true });
  if (user.role !== "admin") return jsonError("Forbidden", 403);

  const body = await parseJson(request);
  const parsed = adminUpdateUserSchema.safeParse(body);
  if (!parsed.success) return jsonError("Invalid input", 400);

  const updated = await updateUserRoleStatus(params.id ?? "", parsed.data);
  if (!updated) return jsonError("User not found", 404);

  return jsonOk({ user: updated });
}

export function loader() {
  return json({ ok: false, error: "Method not allowed" }, { status: 405 });
}
