import { buildQuotationDocument, getQuotationBaseline } from "@junaidi/db";
import { renderQuotation } from "@junaidi/pdf";

import { sessionFrom } from "@/server/auth";
import { corsHeaders, handleOptions, readJson, route } from "@/server/http";
import { quotationSchema } from "@/server/schemas";
import { toPdfView } from "@/server/pdf-view";

export const runtime = "nodejs";
export const maxDuration = 60;

export const OPTIONS = handleOptions;

/**
 * Render a draft to a PDF without saving it, for the live preview beside the
 * builder. Priced and denormalised exactly as a saved quotation would be, so
 * the preview is faithful - and the discount is stripped by `toPdfView`.
 *
 * `editingId`, when present, is the quotation being edited: its saved rows
 * become the baseline, so a row nobody has touched is judged as it stood when
 * chosen, not against today's inventory - the same leniency an actual save
 * gets. Without it (a brand-new quotation) every row is checked fresh.
 */
export const POST = route(async (request) => {
  const session = await sessionFrom(request);
  const body = (await readJson(request)) as Record<string, unknown>;
  const input = quotationSchema.parse(body);
  const baselineStays = await getQuotationBaseline(body.editingId as string | undefined);

  const doc = await buildQuotationDocument(
    input,
    { userId: session.userId, name: session.name, role: session.role },
    "PREVIEW",
    baselineStays,
  );

  const view = await toPdfView(doc as never);
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
