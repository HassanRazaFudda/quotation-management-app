import { DEFAULT_SEASON, findConfigProblems, getConfigBundle } from "@junaidi/db";

import { sessionFrom } from "@/server/auth";
import { handleOptions, json, route } from "@/server/http";

export const runtime = "nodejs";

export const OPTIONS = handleOptions;

/**
 * Everything the builder needs in one request: blocks, locations,
 * accommodations, meals, services, rates and the calendar. The PWA caches this
 * because it changes rarely, which keeps the form instant.
 */
export const GET = route(async (request) => {
  const session = await sessionFrom(request);
  const url = new URL(request.url);
  const season = url.searchParams.get("season") ?? DEFAULT_SEASON;

  const bundle = await getConfigBundle(season);

  return json(request, {
    ...bundle,
    // Only the admin can act on these, so only the admin is shown them.
    problems: session.role === "admin" ? findConfigProblems(bundle) : [],
  });
});
