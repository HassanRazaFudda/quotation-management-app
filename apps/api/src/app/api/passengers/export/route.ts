import { listPassengerSheet } from "@junaidi/db";

import { sessionFrom } from "@/server/auth";
import { corsHeaders, handleOptions, route } from "@/server/http";
import { passengerSheetFilename, passengerSheetQuerySchema, passengerWorkbook } from "@/server/passenger-sheet";

export const runtime = "nodejs";

export const OPTIONS = handleOptions;

/** The passenger sheet as an .xlsx file, with the same filters as the page. Open to all staff. */
export const GET = route(async (request) => {
  await sessionFrom(request);
  const url = new URL(request.url);
  const filter = passengerSheetQuerySchema.parse(Object.fromEntries(url.searchParams));
  const sheet = await listPassengerSheet(filter);
  const bytes = await passengerWorkbook(sheet);

  return new Response(bytes as BodyInit, {
    status: 200,
    headers: {
      ...corsHeaders(request),
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${passengerSheetFilename(sheet.season)}"`,
      "Content-Length": String(bytes.byteLength),
    },
  });
});
