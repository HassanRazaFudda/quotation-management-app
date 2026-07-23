import { createUser, listUsers } from "@junaidi/db";
import { z } from "zod";

import { requireAdmin } from "@/server/auth";
import { handleOptions, json, readJson, route } from "@/server/http";

export const runtime = "nodejs";

export const OPTIONS = handleOptions;

export const GET = route(async (request) => {
  await requireAdmin(request);
  return json(request, { users: await listUsers() });
});

const createSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1),
  password: z.string().min(8),
  role: z.enum(["admin", "staff"]),
});

export const POST = route(async (request) => {
  await requireAdmin(request);
  const body = createSchema.parse(await readJson(request));
  return json(request, await createUser(body), 201);
});
