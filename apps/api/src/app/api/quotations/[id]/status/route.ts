import { changeQuotationStatus } from "@junaidi/db";
import { z } from "zod";

import { sessionFrom } from "@/server/auth";
import { handleOptions, json, notFound, readJson, route } from "@/server/http";

export const runtime = "nodejs";

export const OPTIONS = handleOptions;

const statusSchema = z.object({
  status: z.enum(["draft", "sent", "confirmed", "expired"]),
  /** Required when confirming; the unique booking reference. */
  hbNumber: z.string().max(60).optional(),
});

/**
 * Change a quotation's status. Confirming demands a unique HB number - the
 * uniqueness and the "required" rule are enforced in the service, so a bad
 * request comes back as a plain error the dialog can show.
 */
export const POST = route(async (request, { params }) => {
  const session = await sessionFrom(request);
  const { id } = await params;
  const input = statusSchema.parse(await readJson(request));

  const updated = await changeQuotationStatus(id!, input, {
    userId: session.userId,
    name: session.name,
    role: session.role,
  });
  if (!updated) throw notFound("Quotation");

  return json(request, updated.toJSON());
});
