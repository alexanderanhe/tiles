import type { Route } from "./+types/me";

import { commitUserSession, getUserFromRequest, requireUser } from "../../lib/auth.server";
import { json, jsonError, jsonOk, parseJson } from "../../lib/api.server";
import { meUpdateSchema } from "../../lib/validation.server";
import { findUserByUsername, updateUserProfile } from "../../lib/users.server";

export async function loader({ request }: Route.LoaderArgs) {
  const user = await getUserFromRequest(request);
  return jsonOk({ user });
}

export async function action({ request }: Route.ActionArgs) {
  if (request.method !== "PATCH") {
    return jsonError("Method not allowed", 405);
  }

  const user = await requireUser(request, { api: true });
  const body = await parseJson(request);
  const parsed = meUpdateSchema.safeParse(body);
  if (!parsed.success) return jsonError("Invalid input", 400);

  const username = parsed.data.username?.toLowerCase();
  const name = parsed.data.name?.trim();

  if (username) {
    const existing = await findUserByUsername(username);
    if (existing && existing._id !== user.id) {
      return jsonError("Username already taken", 409);
    }
  }

  const updated = await updateUserProfile(user.id, {
    ...(username ? { username } : {}),
    ...(name ? { name } : {}),
  });

  if (!updated) return jsonError("Not found", 404);

  const cookie = await commitUserSession({
    id: updated._id,
    email: updated.email,
    role: updated.role,
    status: updated.status,
    name: updated.name,
    username: updated.username,
  });

  return jsonOk({ user: updated }, { headers: { "Set-Cookie": cookie } });
}
