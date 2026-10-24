import { changeUmrahQuotationStatus } from "@junaidi/db";

import { sessionFrom } from "@/server/auth";
import { handleOptions, json, notFound, readJson, route } from "@/server/http";
import { umrahStatusSchema } from "@/server/umrah-schemas";

export const runtime = "nodejs";

export const OPTIONS = handleOptions;

/**
 * Change a quotation's status. Confirming demands a unique booking number, and
 * a single price - both rules live in the service, so a bad request comes back
 * as a plain error the dialog can show.
 */
export const POST = route(async (request, { params }) => {
  const session = await sessionFrom(request);
  const { id } = await params;
  const input = umrahStatusSchema.parse(await readJson(request));

  const updated = await changeUmrahQuotationStatus(id!, input, {
    userId: session.userId,
    name: session.name,
    role: session.role,
  });
  if (!updated) throw notFound("Quotation");

  return json(request, updated.toJSON());
});
