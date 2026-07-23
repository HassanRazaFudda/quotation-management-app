import { duplicateQuotation } from "@junaidi/db";

import { sessionFrom } from "@/server/auth";
import { handleOptions, json, route } from "@/server/http";

export const runtime = "nodejs";

export const OPTIONS = handleOptions;

/**
 * Most quotations are a variation on an earlier one, so this is the shortcut
 * staff will reach for most: copy, renumber, date today, open as a draft.
 */
export const POST = route(async (request, { params }) => {
  const session = await sessionFrom(request);
  const { id } = await params;

  const copy = await duplicateQuotation(id!, {
    userId: session.userId,
    name: session.name,
    role: session.role,
  });

  return json(request, copy.toJSON(), 201);
});
