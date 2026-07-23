import { formatPrice, priceQuotation } from "@junaidi/db";

import { sessionFrom } from "@/server/auth";
import { handleOptions, json, readJson, route } from "@/server/http";
import { calculateSchema } from "@/server/schemas";

export const runtime = "nodejs";

export const OPTIONS = handleOptions;

/**
 * Live totals for the builder. The browser also computes these locally from
 * `@junaidi/shared` for instant feedback; this endpoint is the authority and
 * is what the numbers are reconciled against before saving.
 */
export const POST = route(async (request) => {
  await sessionFrom(request);
  const input = calculateSchema.parse(await readJson(request));

  const priced = await priceQuotation({
    ...input,
    guest: { name: "preview", pax: 1 },
    date: new Date(),
  });

  return json(request, {
    totalNights: priced.totalNights,
    subtotal: priced.subtotal,
    discount: priced.discount,
    finalTotal: priced.finalTotal,
    finalTotalFormatted: formatPrice(priced.finalTotal),
    manualOverride: priced.manualOverride,
    warnings: priced.warnings,
    lines: priced.stays.map((stay) => ({
      blockId: stay.blockId,
      label: stay.block.label,
      gregorian: stay.block.gregorianLabel,
      nights: stay.nights,
      rate: stay.rateSnapshot,
      lineTotal: stay.lineTotal,
    })),
  });
});
