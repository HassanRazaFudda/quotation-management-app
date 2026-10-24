import { createUmrahQuotation, listUmrahQuotations } from "@junaidi/db";

import { sessionFrom } from "@/server/auth";
import { handleOptions, json, readJson, route } from "@/server/http";
import { umrahListQuerySchema, umrahQuotationSchema } from "@/server/umrah-schemas";

export const runtime = "nodejs";

export const OPTIONS = handleOptions;

export const GET = route(async (request) => {
  const session = await sessionFrom(request);
  const query = umrahListQuerySchema.parse(Object.fromEntries(new URL(request.url).searchParams));

  // The agency shares one list - everybody sees everybody's work.
  const createdBy = query.mine ? session.userId : query.createdBy;

  return json(request, await listUmrahQuotations({ ...query, createdBy }));
});

export const POST = route(async (request) => {
  const session = await sessionFrom(request);
  const input = umrahQuotationSchema.parse(await readJson(request));

  const quotation = await createUmrahQuotation(input, {
    userId: session.userId,
    name: session.name,
    role: session.role,
  });

  return json(request, quotation.toJSON(), 201);
});
