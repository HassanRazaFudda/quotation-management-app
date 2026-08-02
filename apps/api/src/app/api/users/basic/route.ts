import { listStaffNames } from "@junaidi/db";

import { sessionFrom } from "@/server/auth";
import { handleOptions, json, route } from "@/server/http";

export const runtime = "nodejs";

export const OPTIONS = handleOptions;

/**
 * Active staff as id + name, for the sales-staff picker. Open to any signed-in
 * user (unlike the admin user list), since any staff member records payments.
 */
export const GET = route(async (request) => {
  await sessionFrom(request);
  return json(request, { users: await listStaffNames() });
});
