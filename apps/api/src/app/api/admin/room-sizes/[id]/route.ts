import { deactivateRoomSize } from "@junaidi/db";

import { requireAdmin } from "@/server/auth";
import { handleOptions, json, route } from "@/server/http";

export const runtime = "nodejs";

export const OPTIONS = handleOptions;

export const DELETE = route(async (request, { params }) => {
  await requireAdmin(request);
  const { id } = await params;
  // Soft delete: hotels reference the code as a plain string, so removing a
  // size from the list here does not touch anything already saved.
  await deactivateRoomSize(id!);
  return json(request, { ok: true });
});
