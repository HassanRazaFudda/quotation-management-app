import { listPackages } from "@junaidi/db";

import { sessionFrom } from "@/server/auth";
import { handleOptions, json, route } from "@/server/http";

export const runtime = "nodejs";

export const OPTIONS = handleOptions;

/**
 * The packages staff can start a quotation from. Read-only and open to anyone
 * signed in; only an admin creates or edits them (under /api/admin/packages).
 */
export const GET = route(async (request) => {
  await sessionFrom(request);
  const season = new URL(request.url).searchParams.get("season") ?? undefined;

  return json(request, { packages: await listPackages(season) });
});
