import { reorderAccommodations } from "@junaidi/db";
import { z } from "zod";

import { requireAdmin } from "@/server/auth";
import { handleOptions, json, readJson, route } from "@/server/http";

export const runtime = "nodejs";

export const OPTIONS = handleOptions;

const objectId = z.string().regex(/^[a-f\d]{24}$/i);

const reorderSchema = z.object({
  locationId: objectId,
  /** The hotels/tents in this location, in their new order. */
  orderedIds: z.array(objectId).min(1),
});

export const POST = route(async (request) => {
  await requireAdmin(request);
  const { locationId, orderedIds } = reorderSchema.parse(await readJson(request));
  await reorderAccommodations(locationId, orderedIds);
  return json(request, { ok: true });
});
