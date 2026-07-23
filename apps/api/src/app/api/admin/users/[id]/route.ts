import { assertNotLastAdmin, updateUser } from "@junaidi/db";
import { z } from "zod";

import { requireAdmin } from "@/server/auth";
import { handleOptions, json, readJson, route } from "@/server/http";

export const runtime = "nodejs";

export const OPTIONS = handleOptions;

const patchSchema = z.object({
  name: z.string().min(1).optional(),
  role: z.enum(["admin", "staff"]).optional(),
  active: z.boolean().optional(),
  password: z.string().min(8).optional(),
});

export const PATCH = route(async (request, { params }) => {
  await requireAdmin(request);
  const { id } = await params;
  const body = patchSchema.parse(await readJson(request));

  // Never let the last administrator be demoted or switched off.
  await assertNotLastAdmin(id!, { role: body.role, active: body.active });

  return json(request, await updateUser(id!, body));
});
