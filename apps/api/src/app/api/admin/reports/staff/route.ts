import { staffReport } from "@junaidi/db";

import { requireAdmin } from "@/server/auth";
import { handleOptions, json, route } from "@/server/http";

export const runtime = "nodejs";

export const OPTIONS = handleOptions;

/** Who produced how many quotations, and how much they discounted. Admin only. */
export const GET = route(async (request) => {
  await requireAdmin(request);
  const url = new URL(request.url);

  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  const season = url.searchParams.get("season") ?? undefined;

  const rows = await staffReport({
    season,
    from: from ? new Date(from) : undefined,
    to: to ? new Date(to) : undefined,
  });

  return json(request, { rows });
});
