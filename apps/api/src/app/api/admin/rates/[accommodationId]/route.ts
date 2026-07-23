import { upsertRate } from "@junaidi/db";
import { z } from "zod";

import { requireAdmin } from "@/server/auth";
import { ApiError, handleOptions, json, readJson, route } from "@/server/http";

export const runtime = "nodejs";

export const OPTIONS = handleOptions;

const bodySchema = z.object({
  /** A rate belongs to one block: it is the negotiated total for that stay. */
  blockId: z.string().regex(/^[a-f\d]{24}$/i, "A block is required."),
  season: z.string().min(3),
  model: z.string().optional(),
  rates: z.unknown().optional(),
  amount: z.number().optional(),
  /** Aziziya: one sharing figure, plus separate broken down by occupancy. */
  sharing: z.number().optional(),
  separate: z.unknown().optional(),
});

export const PATCH = route(async (request, { params }) => {
  await requireAdmin(request);
  const { accommodationId } = await params;
  if (!accommodationId) throw new ApiError("Missing accommodation.", 400);

  const body = bodySchema.parse(await readJson(request));

  const rate = await upsertRate(accommodationId, body.blockId, body.season, {
    model: body.model,
    rates: body.rates,
    amount: body.amount,
    sharing: body.sharing,
    separate: body.separate,
  });

  return json(request, rate);
});
