import type { Route } from "./+types/render";

import { action as generateAction, loader as generateLoader } from "./ai.generate";

export async function action(args: Route.ActionArgs) {
  return generateAction(args as Parameters<typeof generateAction>[0]);
}

export async function loader(args: Route.LoaderArgs) {
  return generateLoader(args as Parameters<typeof generateLoader>[0]);
}
