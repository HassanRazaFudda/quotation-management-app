import { deleteUmrahQuotation, getUmrahQuotation, updateUmrahQuotation } from "@junaidi/db";

import { sessionFrom } from "@/server/auth";
import { handleOptions, json, notFound, readJson, route } from "@/server/http";
import { umrahQuotationSchema } from "@/server/umrah-schemas";

export const runtime = "nodejs";

export const OPTIONS = handleOptions;

export const GET = route(async (request, { params }) => {
  await sessionFrom(request); // reading is open to the whole agency
  const { id } = await params;

  const quotation = await getUmrahQuotation(id!);
  if (!quotation) throw notFound("Quotation");

  return json(request, quotation);
});

export const PATCH = route(async (request, { params }) => {
  const session = await sessionFrom(request);
  const { id } = await params;
  const input = umrahQuotationSchema.parse(await readJson(request));

  // Ownership (own, or admin) is enforced in the service.
  const updated = await updateUmrahQuotation(id!, input, {
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

  return json(
    request,
    await deleteUmrahQuotation(id!, { userId: session.userId, name: session.name, role: session.role }),
  );
});
