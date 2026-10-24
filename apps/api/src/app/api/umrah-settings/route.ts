import { getUmrahSettings, updateUmrahSettings } from "@junaidi/db";

import { requireAdmin, sessionFrom } from "@/server/auth";
import { handleOptions, json, readJson, route } from "@/server/http";
import { umrahSettingsSchema } from "@/server/umrah-schemas";

export const runtime = "nodejs";

export const OPTIONS = handleOptions;

/** Read by every signed-in user: the builder starts new quotations from the default text. */
export const GET = route(async (request) => {
  await sessionFrom(request);
  return json(request, await getUmrahSettings());
});

/** Only an administrator changes the letterhead and default text. */
export const PATCH = route(async (request) => {
  const session = await requireAdmin(request);
  const input = umrahSettingsSchema.parse(await readJson(request));
  return json(request, await updateUmrahSettings(input, session.userId));
});
