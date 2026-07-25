import { buildPackagePdfBundle } from "@junaidi/db";
import { renderQuotation } from "@junaidi/pdf";

import { sessionFrom } from "@/server/auth";
import { handleOptions, pdfResponse, readJson, route } from "@/server/http";
import { packagePrintSchema } from "@/server/schemas";
import { toPdfView } from "@/server/pdf-view";

export const runtime = "nodejs";
/** Chromium can take a few seconds on a cold start; give it room. */
export const maxDuration = 60;

export const OPTIONS = handleOptions;

/**
 * A package's brochure, printable by anyone signed in. Customer details are
 * optional: with none it prints as a plain brochure, with a name as a named
 * quote. The itinerary is priced live and the tier prices finalised on the
 * server; the discount never crosses into the view.
 */
export const POST = route(async (request, { params }) => {
  const session = await sessionFrom(request);
  const { id } = await params;

  // The body may be empty (print with no customer), so parse defensively.
  const body = await readJson(request).catch(() => ({}));
  const { guest, validUntil, discount } = packagePrintSchema.parse(body ?? {});

  const { doc, tierPrices, addOns, name } = await buildPackagePdfBundle(id!, {
    guest,
    validUntil: validUntil ?? null,
    discount,
    generatedBy: session.name,
  });

  const view = await toPdfView(doc as never, { asPackage: true, tierPrices, addOns });
  const pdf = await renderQuotation(view);

  const safe = name.replace(/[^\w\s-]/g, "").trim().replace(/\s+/g, "_");
  return pdfResponse(request, pdf, `${safe || "Package"}.pdf`);
});
