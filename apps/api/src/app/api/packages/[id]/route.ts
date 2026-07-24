import { getPackage } from "@junaidi/db";

import { sessionFrom } from "@/server/auth";
import { handleOptions, json, notFound, route } from "@/server/http";

export const runtime = "nodejs";

export const OPTIONS = handleOptions;

/** One package, to prefill the builder. Anyone signed in may read it. */
export const GET = route(async (request, { params }) => {
  await sessionFrom(request);
  const { id } = await params;

  const pkg = await getPackage(id!);
  if (!pkg) throw notFound("Package");

  return json(request, pkg);
});
