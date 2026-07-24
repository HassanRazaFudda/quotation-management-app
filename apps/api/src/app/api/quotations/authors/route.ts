import { quotationAuthors } from "@junaidi/db";

import { sessionFrom } from "@/server/auth";
import { handleOptions, json, route } from "@/server/http";

export const runtime = "nodejs";

export const OPTIONS = handleOptions;

/**
 * Who has written quotations, so the shared list can be narrowed to one
 * person. Names only - no counts, no money; the numbers live in Reports,
 * which stays admin-only.
 */
export const GET = route(async (request) => {
  await sessionFrom(request);
  const season = new URL(request.url).searchParams.get("season") ?? undefined;

  return json(request, await quotationAuthors(season));
});
