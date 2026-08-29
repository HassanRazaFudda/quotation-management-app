import { BLOCK_PHASES, HIJRI_MONTHS, blockLabel, hijriIndex } from "@junaidi/shared";
import { upsertDateBlock } from "@junaidi/db";
import { z } from "zod";

import { requireAdmin } from "@/server/auth";
import { ApiError, handleOptions, json, readJson, route } from "@/server/http";

export const runtime = "nodejs";

export const OPTIONS = handleOptions;

const objectId = z.string().regex(/^[a-f\d]{24}$/i);
const hijri = z.object({ month: z.enum(HIJRI_MONTHS), day: z.number().int().min(1).max(30) });

const blockSchema = z.object({
  id: objectId.nullish(),
  season: z.string().min(3),
  startHijri: hijri,
  endHijri: hijri,
  phase: z.enum(BLOCK_PHASES),
  allowedLocationIds: z.array(objectId).default([]),
  sortOrder: z.number().default(0),
  active: z.boolean().default(true),
});

export const POST = route(async (request) => {
  await requireAdmin(request);
  const { id, ...data } = blockSchema.parse(await readJson(request));

  // A block that ends where it starts is nought nights. One that ends
  // "before" it starts (by month order) is read as running into the next
  // Hijri year instead - e.g. 23 Zilhaj to 03 Muharram, a post-Hajj block
  // that continues past the season's own year-end. Only true zero-length
  // blocks are rejected here.
  if (hijriIndex(data.endHijri) === hijriIndex(data.startHijri)) {
    throw new ApiError(
      `"${blockLabel(data)}" starts and ends on the same day - that is zero nights.`,
      400,
    );
  }

  const saved = await upsertDateBlock(id ?? null, data);
  return json(request, saved, id ? 200 : 201);
});
