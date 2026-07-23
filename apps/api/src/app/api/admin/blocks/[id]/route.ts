import { deactivateDateBlock } from "@junaidi/db";

import { requireAdmin } from "@/server/auth";
import { handleOptions, json, route } from "@/server/http";

export const runtime = "nodejs";

export const OPTIONS = handleOptions;

export const DELETE = route(async (request, { params }) => {
  await requireAdmin(request);
  const { id } = await params;
  // Soft delete: quotations already carry their own copy of the block's dates.
  await deactivateDateBlock(id!);
  return json(request, { ok: true });
});
