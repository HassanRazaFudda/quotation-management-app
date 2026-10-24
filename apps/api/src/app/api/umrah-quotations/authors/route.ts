import { umrahQuotationAuthors } from "@junaidi/db";

import { sessionFrom } from "@/server/auth";
import { handleOptions, json, route } from "@/server/http";

export const runtime = "nodejs";

export const OPTIONS = handleOptions;

/** Who has written Umrah quotations, so the shared list can be narrowed to one person. */
export const GET = route(async (request) => {
  await sessionFrom(request);
  const year = new URL(request.url).searchParams.get("year") ?? undefined;

  return json(request, await umrahQuotationAuthors(year));
});
