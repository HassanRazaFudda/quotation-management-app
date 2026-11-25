import { listPassengerSheet } from "@junaidi/db";

import { sessionFrom } from "@/server/auth";
import { handleOptions, json, route } from "@/server/http";
import { passengerSheetQuerySchema } from "@/server/passenger-sheet";

export const runtime = "nodejs";

export const OPTIONS = handleOptions;

/** Every passenger of the season's confirmed Hajj bookings. Open to all staff. */
export const GET = route(async (request) => {
  await sessionFrom(request);
  const url = new URL(request.url);
  const filter = passengerSheetQuerySchema.parse(Object.fromEntries(url.searchParams));
  return json(request, await listPassengerSheet(filter));
});
