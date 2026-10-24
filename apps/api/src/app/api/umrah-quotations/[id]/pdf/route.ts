import { getUmrahQuotation, getUmrahSettings } from "@junaidi/db";
import { renderQuotation } from "@junaidi/pdf";

import { sessionFrom } from "@/server/auth";
import { handleOptions, notFound, pdfResponse, readJson, route } from "@/server/http";
import { quotationPrintSchema } from "@/server/schemas";
import { toUmrahPdfView, umrahPdfFilename } from "@/server/umrah-pdf-view";

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

  const quotation = await getUmrahQuotation(id!);
  if (!quotation) throw notFound("Quotation");

  const settings = await getUmrahSettings();
  // toUmrahPdfView copies fields explicitly; the discount has no way through.
  const view = await toUmrahPdfView(quotation as never, { branding, company: settings.company });
  const pdf = await renderQuotation(view);

  return pdfResponse(request, pdf, umrahPdfFilename(quotation as never));
});
