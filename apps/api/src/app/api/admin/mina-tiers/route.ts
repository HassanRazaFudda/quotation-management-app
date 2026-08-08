import { upsertMinaTier } from "@junaidi/db";
import { z } from "zod";

import { requireAdmin } from "@/server/auth";
import { handleOptions, json, readJson, route } from "@/server/http";

export const runtime = "nodejs";

export const OPTIONS = handleOptions;

const objectId = z.string().regex(/^[a-f\d]{24}$/i);

const minaTierSchema = z.object({
  id: objectId.nullish(),
  season: z.string().min(3),
  code: z
    .string()
    .min(1)
    .max(40)
    .transform((value) => value.trim()),
  label: z.string().default(""),
  sortOrder: z.number().default(0),
  active: z.boolean().default(true),
});

export const POST = route(async (request) => {
  await requireAdmin(request);
  const { id, ...data } = minaTierSchema.parse(await readJson(request));
  const saved = await upsertMinaTier(id ?? null, data);
  return json(request, saved, id ? 200 : 201);
});
