/**
 * Pricing.
 *
 * Hajj accommodation is sold by the block, not by the night: an operator
 * negotiates a figure for a hotel over a fixed set of dates, and that figure is
 * what the guest pays. A three-night block is not simply three times a nightly
 * rate. So a rate belongs to an (accommodation, block) pair and is used as-is -
 * `nights` is carried for display only and never multiplies anything.
 *
 * Three shapes, chosen by the location's pricing model:
 *
 *   byOccupancy            Makkah / Madinah   rates[occupancy]
 *   bySharingAndOccupancy  Aziziya            rates[roomType][occupancy]
 *   flat                   Mina tents         amount (a tent has no occupancy)
 *
 * The discount is deliberately kept out of everything the PDF can see. See
 * `toPdfTotals` at the bottom - that is the only shape the renderer receives.
 */

import {
  rateKey,
  type Accommodation,
  type Location,
  type Occupancy,
  type PricedStay,
  type QuotationTotals,
  type Rate,
  type ResolvedBlock,
  type StayInput,
} from "./types";

export class PricingError extends Error {
  constructor(
    message: string,
    readonly code:
      | "NO_RATE"
      | "MODEL_MISMATCH"
      | "MISSING_ROOM_TYPE"
      | "UNKNOWN_BLOCK"
      | "UNKNOWN_ACCOMMODATION",
  ) {
    super(message);
    this.name = "PricingError";
  }
}

export interface PricingContext {
  blocks: Map<string, ResolvedBlock>;
  accommodations: Map<string, Accommodation>;
  locations: Map<string, Location>;
  /** Keyed by `accommodationId:blockId`. */
  rates: Map<string, Rate>;
}

/** Build the lookup maps once, then price many stays against them. */
export function makePricingContext(input: {
  blocks: ResolvedBlock[];
  accommodations: Accommodation[];
  locations: Location[];
  rates: Rate[];
}): PricingContext {
  return {
    blocks: new Map(input.blocks.map((b) => [b.id, b])),
    accommodations: new Map(input.accommodations.map((a) => [a.id, a])),
    locations: new Map(input.locations.map((l) => [l.id, l])),
    rates: new Map(input.rates.map((r) => [rateKey(r.accommodationId, r.blockId), r])),
  };
}

/**
 * The block total for one stay, from that stay's own room choice.
 *
 * Each stay carries its room: a guest can take a shared room in Makkah and a
 * private one in Aziziya, so there is no single quotation-wide occupancy.
 */
export function blockTotal(rate: Rate, stay: Pick<StayInput, "roomType" | "occupancy">): number {
  switch (rate.model) {
    case "byOccupancy": {
      // For a hotel the shared room is simply the Quad rate.
      const occupancy = stay.occupancy ?? "Quad";
      return rate.rates[occupancy];
    }

    case "sharingOrSeparate": {
      if (!stay.roomType) {
        throw new PricingError(
          "This stay needs a room type (sharing or separate).",
          "MISSING_ROOM_TYPE",
        );
      }
      // Sharing is one figure: a shared room may be four, five or six people,
      // so it is not priced per occupancy.
      if (stay.roomType === "sharing") return rate.sharing;

      if (!stay.occupancy) {
        throw new PricingError("A Separate room needs a room size.", "MISSING_ROOM_TYPE");
      }
      return rate.separate[stay.occupancy];
    }

    case "flat":
      return rate.amount;
  }
}

export function priceStay(stay: StayInput, context: PricingContext): PricedStay {
  const block = context.blocks.get(stay.blockId);
  if (!block) {
    throw new PricingError(`Unknown date block: ${stay.blockId}`, "UNKNOWN_BLOCK");
  }

  const accommodation = context.accommodations.get(stay.accommodationId);
  if (!accommodation) {
    throw new PricingError(
      `Unknown accommodation: ${stay.accommodationId}`,
      "UNKNOWN_ACCOMMODATION",
    );
  }

  const rate = context.rates.get(rateKey(stay.accommodationId, stay.blockId));
  if (!rate) {
    throw new PricingError(
      `No rate set for "${accommodation.name}" in ${block.label}. An admin must add one.`,
      "NO_RATE",
    );
  }

  const location = context.locations.get(accommodation.locationId);
  if (location && location.pricingModel !== rate.model) {
    throw new PricingError(
      `"${accommodation.name}" is priced as ${rate.model} but ${location.name} ` +
        `expects ${location.pricingModel}.`,
      "MODEL_MISMATCH",
    );
  }

  // The rate IS the total for the block; nights are informational only.
  const lineTotal = blockTotal(rate, stay);

  return { ...stay, nights: block.nights, rateSnapshot: lineTotal, lineTotal };
}

export function priceStays(stays: StayInput[], context: PricingContext): PricedStay[] {
  return stays.map((stay) => priceStay(stay, context));
}

// ------------------------------------------------------------------ totals

export interface TotalsInput {
  stays: PricedStay[];
  /** Air fare, when the package includes flights. Added to the subtotal. */
  flightTotal?: number;
  /** Fixed amount taken off. Internal only - never shown to the customer. */
  discount?: number;
  /** When set, replaces the calculated final total entirely. */
  manualTotal?: number | null;
}

export function calculateTotals(input: TotalsInput): QuotationTotals {
  const totalNights = input.stays.reduce((sum, stay) => sum + stay.nights, 0);
  const accommodation = input.stays.reduce((sum, stay) => sum + stay.lineTotal, 0);
  const subtotal = accommodation + Math.max(0, input.flightTotal ?? 0);

  const discount = clampDiscount(input.discount ?? 0, subtotal);
  const manualOverride =
    input.manualTotal !== null && input.manualTotal !== undefined;

  const finalTotal = manualOverride
    ? Math.max(0, Math.round(input.manualTotal as number))
    : subtotal - discount;

  return { totalNights, subtotal, discount, finalTotal, manualOverride };
}

/** A discount cannot be negative, nor larger than the subtotal. */
function clampDiscount(discount: number, subtotal: number): number {
  if (!Number.isFinite(discount) || discount <= 0) return 0;
  return Math.min(Math.round(discount), subtotal);
}

// ---------------------------------------------------------------- currency

export function formatPrice(amount: number): string {
  return `PKR ${Math.round(amount).toLocaleString("en-US")} /-`;
}

// ------------------------------------------------------- the PDF firewall

/**
 * What the PDF renderer is allowed to know about money.
 *
 * The customer must never see that a discount was applied - no discount line,
 * no subtotal, no strikethrough. Narrowing the type here means the renderer
 * *cannot* leak it even if someone edits the template later; there is a test
 * asserting the discount value never appears in the generated HTML.
 */
export interface PdfTotals {
  totalNights: number;
  /** The single price the customer sees. */
  finalTotal: number;
  finalTotalFormatted: string;
}

export function toPdfTotals(totals: QuotationTotals): PdfTotals {
  return {
    totalNights: totals.totalNights,
    finalTotal: totals.finalTotal,
    finalTotalFormatted: formatPrice(totals.finalTotal),
  };
}
