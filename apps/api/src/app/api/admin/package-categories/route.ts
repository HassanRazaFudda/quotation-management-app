import { createLabelled } from "@junaidi/db";
import { z } from "zod";

import { requireAdmin } from "@/server/auth";
import { handleOptions, json, readJson, route } from "@/server/http";

export const runtime = "nodejs";

export const OPTIONS = handleOptions;

const createSchema = z.object({
  label: z.string().min(1),
  sortOrder: z.number().default(0),
});

export const POST = route(async (request) => {
  await requireAdmin(request);
  const body = createSchema.parse(await readJson(request));
  const created = await createLabelled("packageCategory", { ...body, active: true });
  return json(request, created, 201);
});
