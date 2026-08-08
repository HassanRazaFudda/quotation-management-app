import { deactivateMinaTier } from "@junaidi/db";

import { requireAdmin } from "@/server/auth";
import { handleOptions, json, route } from "@/server/http";

export const runtime = "nodejs";

export const OPTIONS = handleOptions;

export const DELETE = route(async (request, { params }) => {
  await requireAdmin(request);
  const { id } = await params;
  // Soft delete: accommodations reference the code as a plain string, so
  // removing a tier from the list here does not touch anything already saved.
  await deactivateMinaTier(id!);
  return json(request, { ok: true });
});
