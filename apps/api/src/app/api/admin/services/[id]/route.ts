import { deactivate, updateLabelled } from "@junaidi/db";
import { z } from "zod";

import { requireAdmin } from "@/server/auth";
import { handleOptions, json, readJson, route } from "@/server/http";

export const runtime = "nodejs";

export const OPTIONS = handleOptions;

const patchSchema = z.object({
  label: z.string().min(1).optional(),
  defaultSelected: z.boolean().optional(),
  sortOrder: z.number().optional(),
  active: z.boolean().optional(),
});

export const PATCH = route(async (request, { params }) => {
  await requireAdmin(request);
  const { id } = await params;
  const body = patchSchema.parse(await readJson(request));
  return json(request, await updateLabelled("service", id!, body));
});

export const DELETE = route(async (request, { params }) => {
  await requireAdmin(request);
  const { id } = await params;
  // Soft delete: existing quotations already hold the label as text.
  await deactivate("service", id!);
  return json(request, { ok: true });
});
