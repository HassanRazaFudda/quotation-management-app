import { deactivateCurrency } from "@junaidi/db";

import { requireAdmin } from "@/server/auth";
import { handleOptions, json, route } from "@/server/http";

export const runtime = "nodejs";

export const OPTIONS = handleOptions;

export const DELETE = route(async (request, { params }) => {
  await requireAdmin(request);
  const { id } = await params;
  // Soft delete: a quotation already froze its own rate, so this is safe.
  await deactivateCurrency(id!);
  return json(request, { ok: true });
});
