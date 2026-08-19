import { upsertPackage } from "@junaidi/db";

import { sessionFrom } from "@/server/auth";
import { handleOptions, json, readJson, route } from "@/server/http";
import { packageSchema } from "@/server/schemas";

export const runtime = "nodejs";

export const OPTIONS = handleOptions;

/** Create or update a package. Any signed-in user; validation lives in the service. */
export const POST = route(async (request) => {
  await sessionFrom(request);
  const { id, ...data } = packageSchema.parse(await readJson(request));

  const saved = await upsertPackage(id ?? null, data);
  return json(request, saved, id ? 200 : 201);
});
