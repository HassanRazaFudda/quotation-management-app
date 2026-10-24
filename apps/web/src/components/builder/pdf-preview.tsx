"use client";

import { PdfPreviewFrame } from "@/components/pdf-preview-frame";
import { toApiPayload, toPackagePayload, useBuilderStore } from "@/stores/builder";
import { useConfigStore } from "@/stores/config";

/**
 * Live PDF preview of the Hajj quotation or package being built. The rendering
 * itself is the shared `PdfPreviewFrame`; this only decides what to send.
 */
export function PdfPreview({
  canPreview,
  asPackage = false,
  packageName = "",
}: {
  canPreview: boolean;
  /** Preview as a package brochure (tier prices, add-ons) instead of a customer quotation. */
  asPackage?: boolean;
  /** The package name being typed - only used to satisfy the preview payload, never saved. */
  packageName?: string;
}) {
  const builder = useBuilderStore();
  const season = useConfigStore((s) => s.season);

  // A signature of everything that affects the document, so we only re-render
  // when something visible actually changed. The guest/package name is still
  // being typed while the itinerary is built, so stand in a placeholder for
  // the preview rather than letting an empty name fail validation.
  const signature = asPackage
    ? JSON.stringify(toPackagePayload(builder, season, packageName || "Package"))
    : JSON.stringify(
        (() => {
          const payload = toApiPayload(builder, season);
          const named = payload.guest.name
            ? payload
            : { ...payload, guest: { ...payload.guest, name: "Guest Name" } };
          // Lets the server judge an untouched row against what's already
          // saved, same as it would on an actual save, instead of re-checking
          // it against today's inventory - see `getQuotationBaseline`.
          return builder.quotationId ? { ...named, editingId: builder.quotationId } : named;
        })(),
      );

  return (
    <PdfPreviewFrame
      endpoint={asPackage ? "/api/packages/preview-pdf" : "/api/quotations/preview-pdf"}
      body={signature}
      canPreview={canPreview}
      emptyHint="Add stays and fix any errors to see the preview."
    />
  );
}
