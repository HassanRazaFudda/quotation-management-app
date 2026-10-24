import { buildUmrahQuotationDocument, getUmrahSettings } from "@junaidi/db";
import { renderQuotation } from "@junaidi/pdf";

import { sessionFrom } from "@/server/auth";
import { corsHeaders, handleOptions, readJson, route } from "@/server/http";
import { toUmrahPdfView } from "@/server/umrah-pdf-view";
import { umrahQuotationSchema } from "@/server/umrah-schemas";

export const runtime = "nodejs";
export const maxDuration = 60;

export const OPTIONS = handleOptions;

/**
 * Render a draft to a PDF without saving it, for the live preview beside the
 * builder. Priced exactly as a saved quotation would be, and the discount is
 * stripped by `toUmrahPdfView` the same way.
 */
export const POST = route(async (request) => {
  const session = await sessionFrom(request);
  const input = umrahQuotationSchema.parse(await readJson(request));

  const doc = buildUmrahQuotationDocument(
    input,
    { userId: session.userId, name: session.name, role: session.role },
    "PREVIEW",
  );

  const settings = await getUmrahSettings();
  const view = await toUmrahPdfView(doc as never, { company: settings.company });
  const pdf = await renderQuotation(view);

  // Inline (not an attachment) so it can show in an <iframe>.
  return new Response(pdf as BodyInit, {
    status: 200,
    headers: {
      ...corsHeaders(request),
      "Content-Type": "application/pdf",
      "Content-Disposition": "inline",
    },
  });
});
