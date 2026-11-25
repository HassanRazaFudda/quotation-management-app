import { listPassengerSheet } from "@junaidi/db";
import { sortSheetRows } from "@junaidi/shared";

import { sessionFrom } from "@/server/auth";
import { corsHeaders, handleOptions, readJson, route } from "@/server/http";
import { passengerSheetFilename, passengerSheetQuerySchema, passengerWorkbook } from "@/server/passenger-sheet";

export const runtime = "nodejs";

export const OPTIONS = handleOptions;

type Filter = ReturnType<(typeof passengerSheetQuerySchema)["parse"]>;

/** The file follows the page: the same rows, in the same order. */
async function exportSheet(request: Request, filter: Filter): Promise<Response> {
  const sheet = await listPassengerSheet(filter);
  const rows = sortSheetRows(
    sheet.bookings.flatMap((booking) => booking.rows),
    filter.sort,
  );
  const bytes = await passengerWorkbook({ ...sheet, bookings: [{ id: "all", quotationId: "", rows }] });

  return new Response(bytes as BodyInit, {
    status: 200,
    headers: {
      ...corsHeaders(request),
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${passengerSheetFilename(sheet.season)}"`,
      "Content-Length": String(bytes.byteLength),
    },
  });
}

/** The passenger sheet as an .xlsx file, filters in the query string. Open to all staff. */
export const GET = route(async (request) => {
  await sessionFrom(request);
  const url = new URL(request.url);
  return exportSheet(request, passengerSheetQuerySchema.parse(Object.fromEntries(url.searchParams)));
});

/**
 * The same, filters in the body. The page uses this: ticking hundreds of values
 * in a column (every name but one) would not fit in a URL.
 */
export const POST = route(async (request) => {
  await sessionFrom(request);
  const body = ((await readJson<Record<string, unknown>>(request).catch(() => ({}))) ?? {}) as Record<string, unknown>;
  // The column filters arrive as an object; the shared schema reads them as JSON text.
  const columns = body.columns && typeof body.columns === "object" ? JSON.stringify(body.columns) : body.columns;
  return exportSheet(request, passengerSheetQuerySchema.parse({ ...body, columns }));
});
