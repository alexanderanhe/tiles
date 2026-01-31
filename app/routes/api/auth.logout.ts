import type { Route } from "./+types/auth.logout";

import { destroyUserSession } from "../../lib/auth.server";
import { json } from "../../lib/api.server";

export async function action({ request }: Route.ActionArgs) {
  const cookie = await destroyUserSession(request);
  return json({ ok: true }, { headers: { "Set-Cookie": cookie } });
}

export function loader() {
  return json({ ok: false, error: "Method not allowed" }, { status: 405 });
}
