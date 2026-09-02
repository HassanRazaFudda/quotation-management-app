import { SERVICE_CATEGORIES } from "@junaidi/shared";
import { createLabelled } from "@junaidi/db";
import { z } from "zod";

import { requireAdmin } from "@/server/auth";
import { handleOptions, json, readJson, route } from "@/server/http";

export const runtime = "nodejs";

export const OPTIONS = handleOptions;

const objectId = z.string().regex(/^[a-f\d]{24}$/i);

const createSchema = z.object({
  category: z.enum(SERVICE_CATEGORIES),
  label: z.string().min(1),
  defaultSelected: z.boolean().default(true),
  color: z.string().max(9).optional(),
  bold: z.boolean().optional(),
  /** Narrows this line to one Maktab category; absent means every category. */
  packageCategoryId: objectId.nullish(),
  sortOrder: z.number().default(0),
});

export const POST = route(async (request) => {
  await requireAdmin(request);
  const body = createSchema.parse(await readJson(request));
  const created = await createLabelled("service", { ...body, active: true });
  return json(request, created, 201);
});
