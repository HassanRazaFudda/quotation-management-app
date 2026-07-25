import { createQuotationFromPackage } from "@junaidi/db";

import { sessionFrom } from "@/server/auth";
import { handleOptions, json, readJson, route } from "@/server/http";
import { packageQuoteSchema } from "@/server/schemas";

export const runtime = "nodejs";

export const OPTIONS = handleOptions;

/**
 * Save a package as a customer quotation, so it can be confirmed and given an
 * HB number. Open to anyone signed in; the new quotation belongs to them.
 */
export const POST = route(async (request, { params }) => {
  const session = await sessionFrom(request);
  const { id } = await params;
  const body = packageQuoteSchema.parse(await readJson(request));

  const created = await createQuotationFromPackage(
    id!,
    { userId: session.userId, name: session.name, role: session.role },
    {
      guest: body.guest,
      validUntil: body.validUntil ?? null,
      discount: body.discount,
      tier: body.tier ?? null,
    },
  );

  return json(request, created.toJSON(), 201);
});
