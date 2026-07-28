import { getQuotation } from "@junaidi/db";
import { renderQuotation } from "@junaidi/pdf";

import { sessionFrom } from "@/server/auth";
import { handleOptions, notFound, pdfResponse, readJson, route } from "@/server/http";
import { pdfFilename, toPdfView } from "@/server/pdf-view";
import { quotationPrintSchema } from "@/server/schemas";

export const runtime = "nodejs";
/** Chromium can take a few seconds on a cold start; give it room. */
export const maxDuration = 60;

export const OPTIONS = handleOptions;

export const POST = route(async (request, { params }) => {
  await sessionFrom(request); // the whole agency may print any quotation
  const { id } = await params;

  // The body is optional (a plain download sends none); default to branded.
  const body = await readJson(request).catch(() => ({}));
  const { branding } = quotationPrintSchema.parse(body ?? {});

  const quotation = await getQuotation(id!);
  if (!quotation) throw notFound("Quotation");

  // toPdfView copies fields explicitly; the discount has no way through.
  const view = await toPdfView(quotation as never, { branding });
  const pdf = await renderQuotation(view);

  return pdfResponse(request, pdf, pdfFilename(quotation as never));
});
