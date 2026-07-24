import { upsertPackage } from "@junaidi/db";

import { requireAdmin } from "@/server/auth";
import { handleOptions, json, readJson, route } from "@/server/http";
import { packageSchema } from "@/server/schemas";

export const runtime = "nodejs";

export const OPTIONS = handleOptions;

/** Create or update a package. Admin only; validation lives in the service. */
export const POST = route(async (request) => {
  await requireAdmin(request);
  const { id, ...data } = packageSchema.parse(await readJson(request));

  const saved = await upsertPackage(id ?? null, data);
  return json(request, saved, id ? 200 : 201);
});
