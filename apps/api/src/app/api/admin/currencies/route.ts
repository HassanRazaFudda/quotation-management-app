import { upsertCurrency } from "@junaidi/db";
import { z } from "zod";

import { requireAdmin } from "@/server/auth";
import { handleOptions, json, readJson, route } from "@/server/http";

export const runtime = "nodejs";

export const OPTIONS = handleOptions;

const objectId = z.string().regex(/^[a-f\d]{24}$/i);

const currencySchema = z.object({
  id: objectId.nullish(),
  season: z.string().min(3),
  code: z
    .string()
    .min(1)
    .max(8)
    .transform((value) => value.trim().toUpperCase())
    .refine((code) => code !== "PKR", "PKR is the base currency and is always available."),
  name: z.string().default(""),
  symbol: z.string().default(""),
  /** How many PKR one unit of this currency costs. */
  rate: z.number().positive("The exchange rate must be greater than zero."),
  decimals: z.number().int().min(0).max(4).default(2),
  enabled: z.boolean().default(true),
  sortOrder: z.number().default(0),
  active: z.boolean().default(true),
});

export const POST = route(async (request) => {
  await requireAdmin(request);
  const { id, ...data } = currencySchema.parse(await readJson(request));
  const saved = await upsertCurrency(id ?? null, data);
  return json(request, saved, id ? 200 : 201);
});
