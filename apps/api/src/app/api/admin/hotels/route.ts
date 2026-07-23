import { MINA_TIERS, OCCUPANCIES, SHARING_WORDS } from "@junaidi/shared";
import { upsertAccommodation } from "@junaidi/db";
import { z } from "zod";

import { requireAdmin } from "@/server/auth";
import { handleOptions, json, readJson, route } from "@/server/http";

export const runtime = "nodejs";

export const OPTIONS = handleOptions;

const objectId = z.string().regex(/^[a-f\d]{24}$/i);

const hotelSchema = z.object({
  id: objectId.nullish(),
  locationId: objectId,
  name: z.string().min(1),
  minaTier: z.enum(MINA_TIERS).nullish(),
  bedsPerTent: z.number().int().nullish(),
  /** The Mina option that books no tent, priced for its Muallim services. */
  withoutMina: z.boolean().default(false),
  /** Room sizes the hotel has; empty means all of them. */
  allowedOccupancies: z.array(z.enum(OCCUPANCIES)).default([]),
  /** Sizes its shared rooms come in (Quad/Quint/Hexa); empty means all. */
  allowedSharingWords: z.array(z.enum(SHARING_WORDS)).default([]),
  /** Package categories this option may be sold under; empty means any. */
  allowedCategories: z.array(objectId).default([]),
  allowedMealIds: z.array(objectId).default([]),
  allowedMealNoteIds: z.array(objectId).default([]),
  sortOrder: z.number().default(0),
  active: z.boolean().default(true),
});

export const POST = route(async (request) => {
  await requireAdmin(request);
  const { id, ...data } = hotelSchema.parse(await readJson(request));
  const saved = await upsertAccommodation(id ?? null, data);
  return json(request, saved, id ? 200 : 201);
});
