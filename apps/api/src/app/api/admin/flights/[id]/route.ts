import { deactivateFlight } from "@junaidi/db";

import { requireAdmin } from "@/server/auth";
import { handleOptions, json, route } from "@/server/http";

export const runtime = "nodejs";

export const OPTIONS = handleOptions;

export const DELETE = route(async (request, { params }) => {
  await requireAdmin(request);
  const { id } = await params;
  // Soft delete: saved quotations already hold their own copy of the sector.
  await deactivateFlight(id!);
  return json(request, { ok: true });
});
