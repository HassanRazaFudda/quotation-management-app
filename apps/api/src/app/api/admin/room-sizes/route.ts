import { upsertRoomSize } from "@junaidi/db";
import { z } from "zod";

import { requireAdmin } from "@/server/auth";
import { handleOptions, json, readJson, route } from "@/server/http";

export const runtime = "nodejs";

export const OPTIONS = handleOptions;

const objectId = z.string().regex(/^[a-f\d]{24}$/i);

const roomSizeSchema = z.object({
  id: objectId.nullish(),
  season: z.string().min(3),
  code: z
    .string()
    .min(1)
    .max(40)
    .transform((value) => value.trim()),
  label: z.string().default(""),
  /** People this size means when used as sharing wording. Omit if not applicable. */
  sharingGroupSize: z.number().int().positive().nullish(),
  sortOrder: z.number().default(0),
  active: z.boolean().default(true),
});

export const POST = route(async (request) => {
  await requireAdmin(request);
  const { id, ...data } = roomSizeSchema.parse(await readJson(request));
  const saved = await upsertRoomSize(id ?? null, data);
  return json(request, saved, id ? 200 : 201);
});
