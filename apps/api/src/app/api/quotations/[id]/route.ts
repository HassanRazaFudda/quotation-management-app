import { deleteQuotation, getQuotation, updateQuotation } from "@junaidi/db";

import { sessionFrom } from "@/server/auth";
import { handleOptions, json, notFound, readJson, route } from "@/server/http";
import { quotationSchema } from "@/server/schemas";

export const runtime = "nodejs";

export const OPTIONS = handleOptions;

export const GET = route(async (request, { params }) => {
  await sessionFrom(request); // signed in is enough
  const { id } = await params;

  // Reading is open to the whole agency; only editing stays with the author
  // (and the admin) - that rule lives in the service.
  const quotation = await getQuotation(id!);
  if (!quotation) throw notFound("Quotation");

  return json(request, quotation);
});

export const PATCH = route(async (request, { params }) => {
  const session = await sessionFrom(request);
  const { id } = await params;
  const input = quotationSchema.parse(await readJson(request));

  const updated = await updateQuotation(id!, input, {
    userId: session.userId,
    name: session.name,
    role: session.role,
  });
  if (!updated) throw notFound("Quotation");

  return json(request, updated.toJSON());
});

export const DELETE = route(async (request, { params }) => {
  const session = await sessionFrom(request);
  const { id } = await params;

  // Ownership (own, or admin) is enforced in the service.
  const result = await deleteQuotation(id!, {
    userId: session.userId,
    name: session.name,
    role: session.role,
  });

  return json(request, result);
});
