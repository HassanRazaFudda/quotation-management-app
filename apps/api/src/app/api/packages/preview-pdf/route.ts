import { previewPackagePdfBundle } from "@junaidi/db";
import { renderQuotation } from "@junaidi/pdf";

import { sessionFrom } from "@/server/auth";
import { corsHeaders, handleOptions, readJson, route } from "@/server/http";
import { packageSchema } from "@/server/schemas";
import { toPdfView } from "@/server/pdf-view";

export const runtime = "nodejs";
export const maxDuration = 60;

export const OPTIONS = handleOptions;

/**
 * Render a package still being built to a PDF without saving it, for the live
 * preview beside the package builder. Priced exactly as printing it would be
 * - tier totals, add-ons and all - so the preview is faithful; unlike a real
 * print, no add-on is pre-selected and there is no discount.
 */
export const POST = route(async (request) => {
  await sessionFrom(request);
  const { id: _id, ...input } = packageSchema.parse(await readJson(request));

  const { doc, tierPrices, addOns } = await previewPackagePdfBundle(input);

  const view = await toPdfView(doc as never, { asPackage: true, tierPrices, addOns });
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
