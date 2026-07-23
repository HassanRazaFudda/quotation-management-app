import { getQuotation, updateQuotation } from "@junaidi/db";

import { sessionFrom } from "@/server/auth";
import { ApiError, handleOptions, json, notFound, readJson, route } from "@/server/http";
import { quotationSchema } from "@/server/schemas";

export const runtime = "nodejs";

export const OPTIONS = handleOptions;

export const GET = route(async (request, { params }) => {
  const session = await sessionFrom(request);
  const { id } = await params;

  const quotation = await getQuotation(id!);
  if (!quotation) throw notFound("Quotation");

  if (session.role !== "admin" && String(quotation.createdBy) !== session.userId) {
    throw new ApiError("You can only open your own quotations.", 403);
  }

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
