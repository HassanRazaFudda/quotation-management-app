import { isConnected } from "@junaidi/db";
import { healthCheck } from "@junaidi/pdf";

import { handleOptions, json, route } from "@/server/http";

export const runtime = "nodejs";
export const maxDuration = 60;

export const OPTIONS = handleOptions;

/**
 * Deep health check: proves Mongo is reachable AND that Chromium can actually
 * print. A deploy where Chromium is missing its shared libraries otherwise
 * looks healthy right up until the first customer quotation.
 *
 * Also doubles as the keep-warm target for a scheduled ping.
 */
export const GET = route(async (request) => {
  const url = new URL(request.url);
  const deep = url.searchParams.get("deep") !== "false";

  const database = isConnected();
  const chromium = deep ? await healthCheck() : { ok: true, detail: "skipped" };
  const ok = database && chromium.ok;

  return json(
    request,
    {
      ok,
      database: database ? "connected" : "disconnected",
      chromium: chromium.detail,
      time: new Date().toISOString(),
    },
    ok ? 200 : 503,
  );
});
