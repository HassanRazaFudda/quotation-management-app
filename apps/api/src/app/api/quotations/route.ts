import { createQuotation, listQuotations } from "@junaidi/db";

import { sessionFrom } from "@/server/auth";
import { handleOptions, json, readJson, route } from "@/server/http";
import { listQuerySchema, quotationSchema } from "@/server/schemas";

export const runtime = "nodejs";

export const OPTIONS = handleOptions;

export const GET = route(async (request) => {
  const session = await sessionFrom(request);
  const url = new URL(request.url);
  const query = listQuerySchema.parse(Object.fromEntries(url.searchParams));

  // Staff see only their own work; an admin sees everyone's unless they ask.
  const createdBy =
    session.role === "admin" ? (query.mine ? session.userId : undefined) : session.userId;

  const result = await listQuotations({ ...query, createdBy });
  return json(request, result);
});

export const POST = route(async (request) => {
  const session = await sessionFrom(request);
  const input = quotationSchema.parse(await readJson(request));

  const quotation = await createQuotation(input, {
    userId: session.userId,
    name: session.name,
    role: session.role,
  });

  return json(request, quotation.toJSON(), 201);
});
