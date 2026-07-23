import { SERVICE_CATEGORIES } from "@junaidi/shared";
import { createLabelled } from "@junaidi/db";
import { z } from "zod";

import { requireAdmin } from "@/server/auth";
import { handleOptions, json, readJson, route } from "@/server/http";

export const runtime = "nodejs";

export const OPTIONS = handleOptions;

const createSchema = z.object({
  category: z.enum(SERVICE_CATEGORIES),
  label: z.string().min(1),
  defaultSelected: z.boolean().default(true),
  sortOrder: z.number().default(0),
});

export const POST = route(async (request) => {
  await requireAdmin(request);
  const body = createSchema.parse(await readJson(request));
  const created = await createLabelled("service", { ...body, active: true });
  return json(request, created, 201);
});
