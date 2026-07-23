import { FLIGHT_DIRECTIONS } from "@junaidi/shared";
import { upsertFlight } from "@junaidi/db";
import { z } from "zod";

import { requireAdmin } from "@/server/auth";
import { handleOptions, json, readJson, route } from "@/server/http";

export const runtime = "nodejs";

export const OPTIONS = handleOptions;

const objectId = z.string().regex(/^[a-f\d]{24}$/i);

const flightSchema = z.object({
  id: objectId.nullish(),
  season: z.string().min(3),
  direction: z.enum(FLIGHT_DIRECTIONS),
  origin: z.string().min(1),
  destination: z.string().min(1),
  /** Round-trip only: city the return leg departs from. */
  returnFrom: z.string().default(""),
  airline: z.string().default(""),
  price: z.number().min(0),
  sortOrder: z.number().default(0),
  active: z.boolean().default(true),
});

export const POST = route(async (request) => {
  await requireAdmin(request);
  const { id, ...data } = flightSchema.parse(await readJson(request));
  const saved = await upsertFlight(id ?? null, data);
  return json(request, saved, id ? 200 : 201);
});
