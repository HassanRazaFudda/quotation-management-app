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

import { nestedHajjBlocks } from "./calendar";
import {
  OCCUPANCIES,
  rateKey,
  TIER_OCCUPANCIES,
  type Accommodation,
  type Location,
  type PricedRoom,
  type PricedStay,
  type QuotationTotals,
  type Rate,
  type ResolvedBlock,
  type RoomEntry,
  type StayInput,
  type TierOccupancy,
  type TierPricing,
  type TierSetting,
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
export function blockTotal(
  rate: Rate,
  stay: Pick<StayInput, "roomType" | "occupancy" | "withoutBed">,
): number {
  // A guest sharing a room without their own bed is priced at the hotel's own
  // no-bed figure, whatever the room around them is.
  if (stay.withoutBed) {
    const noBed = rate.withoutBed ?? 0;
    if (noBed <= 0) {
      throw new PricingError(
        `No "without bed" rate is set for this accommodation in this block. An admin must add one.`,
        "NO_RATE",
      );
    }
    return noBed;
  }

  switch (rate.model) {
    case "byOccupancy": {
      // For a hotel the shared room is simply the Sharing rate.
      const occupancy = stay.occupancy ?? "Sharing";
      const figure = rate.rates[occupancy];
      // Undefined (not 0) means this size has never been priced for this
      // accommodation - a rate row saved before the size existed, or a size
      // the admin has not gotten to yet. 0 stays the ordinary "not priced"
      // placeholder, unchanged.
      if (figure === undefined) {
        throw new PricingError(
          `No rate is set for "${occupancy}" on this accommodation in this block. An admin must add one.`,
          "NO_RATE",
        );
      }
      return figure;
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
      const figure = rate.separate[stay.occupancy];
      if (figure === undefined) {
        throw new PricingError(
          `No rate is set for "${stay.occupancy}" on this accommodation in this block. An admin must add one.`,
          "NO_RATE",
        );
      }
      return figure;
    }

    case "flat":
      return rate.amount;
  }
}

/**
 * The rooms a stay is priced from. A stay with its own `rooms` list is a mix
 * (a family across two room types); otherwise the whole party — `pax` people —
 * shares the stay's single room choice, which is the ordinary case.
 */
function stayRooms(stay: StayInput, pax: number): RoomEntry[] {
  if (stay.rooms && stay.rooms.length > 0) return stay.rooms;
  return [
    {
      accommodationId: stay.accommodationId,
      roomType: stay.roomType ?? null,
      occupancy: stay.occupancy ?? null,
      sharingWord: stay.sharingWord ?? null,
      withoutBed: stay.withoutBed ?? null,
      headcount: Math.max(1, Math.round(pax)),
    },
  ];
}

/** Price one room entry: resolve its rate and multiply by its headcount. */
function priceRoom(entry: RoomEntry, block: ResolvedBlock, context: PricingContext): PricedRoom {
  const accommodation = context.accommodations.get(entry.accommodationId);
  if (!accommodation) {
    throw new PricingError(
      `Unknown accommodation: ${entry.accommodationId}`,
      "UNKNOWN_ACCOMMODATION",
    );
  }

  const rate = context.rates.get(rateKey(entry.accommodationId, block.id));
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

  const perPerson = blockTotal(rate, entry);
  const headcount = Math.max(0, Math.round(entry.headcount));
  return { ...entry, headcount, accommodationName: accommodation.name, perPerson, cost: perPerson * headcount };
}

/**
 * Price a stay for the whole party.
 *
 * `pax` is only used to spread a single room choice across the group and to
 * divide the group total back to a per-person figure; a stay carrying its own
 * `rooms` mix prices each entry by its own headcount instead.
 */
export function priceStay(stay: StayInput, context: PricingContext, pax = 1): PricedStay {
  const block = context.blocks.get(stay.blockId);
  if (!block) {
    throw new PricingError(`Unknown date block: ${stay.blockId}`, "UNKNOWN_BLOCK");
  }

  const rooms = stayRooms(stay, pax).map((entry) => priceRoom(entry, block, context));
  const groupTotal = rooms.reduce((sum, room) => sum + room.cost, 0);
  const heads = Math.max(1, Math.round(pax));
  // Per person: the party's rooms divided by the party. For one room choice this
  // is exactly the rate; for a mix it is the PAX-weighted average.
  const lineTotal = groupTotal / heads;

  return {
    ...stay,
    nights: block.nights,
    rateSnapshot: rooms[0]?.perPerson ?? 0,
    lineTotal,
    groupTotal,
    rooms,
  };
}

/**
 * Nights already counted by a block that spans them are not counted again.
 *
 * The Hajj row inside an "Aziziya including Hajj days" stay is a second entry
 * for days the hotel row has already charged and already counted, so it carries
 * no nights of its own - otherwise a 20-night package would read as 24. Its
 * price is untouched: the Maktab is a real, separate charge.
 */
export function applyNestedNights<T extends { blockId: string; nights: number }>(
  stays: T[],
  blocks: ResolvedBlock[],
): T[] {
  const chosen = stays
    .map((stay) => blocks.find((block) => block.id === stay.blockId))
    .filter((block): block is ResolvedBlock => Boolean(block));

  const { nested } = nestedHajjBlocks(chosen);
  if (nested.size === 0) return stays;

  return stays.map((stay) => (nested.has(stay.blockId) ? { ...stay, nights: 0 } : stay));
}

export function priceStays(stays: StayInput[], context: PricingContext, pax = 1): PricedStay[] {
  return applyNestedNights(
    stays.map((stay) => priceStay(stay, context, pax)),
    [...context.blocks.values()],
  );
}

// ------------------------------------------------------- package tier pricing

/** One tier's calculated figure, with whether every hotel could be priced. */
export interface TierAutoPrice {
  occupancy: TierOccupancy;
  /** The itinerary summed with the hotels filled at this occupancy. */
  total: number;
  /**
   * True when every hotel had a rate for this occupancy. A hotel missing its
   * Triple or Double rate leaves `total` short of the real figure, so the UI
   * asks the staff member to type the price in rather than trusting it.
   */
  complete: boolean;
}

/**
 * Price one itinerary at each occupancy tier.
 *
 * A package is quoted as up to three prices for identical rooms and dates.
 * Anything priced by room size - a Makkah/Madinah hotel's shared vs. private
 * room, or Aziziya's own Sharing vs. Separate rate - moves between Quad,
 * Triple and Double; the stay's own saved room choice is ignored, since a
 * package prices all three sizes regardless of what one one is picked. Only
 * Mina (a flat per-tent figure with no room-size concept) contributes the
 * same amount to every tier.
 *
 * This is calculation only; whether a tier is offered, overridden or discounted
 * is decided above, in `finalTierTotal`.
 */
export function priceTiers(stays: StayInput[], context: PricingContext): TierAutoPrice[] {
  return TIER_OCCUPANCIES.map((occupancy) => {
    let total = 0;
    let complete = true;

    for (const stay of stays) {
      const rate = context.rates.get(rateKey(stay.accommodationId, stay.blockId));
      if (!rate) {
        complete = false;
        continue;
      }

      if (rate.model === "byOccupancy") {
        // Tier pricing's "Quad" has always meant the hotel's shared room,
        // which is now priced under "Sharing".
        const ratesField = occupancy === "Quad" ? "Sharing" : occupancy;
        const figure = rate.rates[ratesField] ?? 0;
        if (figure <= 0) complete = false;
        total += figure;
        continue;
      }

      if (rate.model === "sharingOrSeparate") {
        // Aziziya's own Sharing rate stands in for "Quad" - a shared room, the
        // same idea as a hotel's - and its Separate rate for Triple/Double.
        const figure = occupancy === "Quad" ? rate.sharing : rate.separate[occupancy];
        if (!figure || figure <= 0) complete = false;
        total += figure ?? 0;
        continue;
      }

      // Mina (flat) keeps its own figure across every tier - a tent costs the
      // same however the hotels are filled.
      try {
        total += blockTotal(rate, stay);
      } catch {
        complete = false;
      }
    }

    return { occupancy, total, complete };
  });
}

/** The offered tiers in Quad-Triple-Double order, each with its settings. */
export function offeredTiers(
  pricing: TierPricing | null | undefined,
): Array<{ occupancy: TierOccupancy; setting: TierSetting }> {
  if (!pricing?.enabled) return [];
  return TIER_OCCUPANCIES.flatMap((occupancy) => {
    const setting = pricing[occupancy];
    return setting ? [{ occupancy, setting }] : [];
  });
}

/**
 * The single figure a tier prints: a typed-in override wins outright, otherwise
 * the calculated total with that tier's own discount taken off. The discount is
 * internal - only this result ever reaches the page.
 *
 * `auto`, `manualTotal` and `discount` must already be in the same currency -
 * `auto` is converted by the caller before this runs, since a package's manual
 * figures are typed directly in its own currency, never PKR-then-converted.
 * `decimals` rounds to that currency's precision (0 for PKR, 2 for most others).
 */
export function finalTierTotal(auto: number, setting: TierSetting, decimals = 0): number {
  const roundMoney = (value: number): number => roundToDecimals(value, decimals);
  if (setting.manualTotal !== null && setting.manualTotal !== undefined) {
    return Math.max(0, roundMoney(setting.manualTotal));
  }
  return Math.max(0, auto - clampDiscount(setting.discount, auto, roundMoney));
}

// ------------------------------------------------------------------ totals

export interface TotalsInput {
  stays: PricedStay[];
  /** Air fare per person, when the package includes flights. */
  flightTotal?: number;
  /** Fixed amount taken off, per person. Internal only - never shown. */
  discount?: number;
  /**
   * A signed rounding adjustment on the net (subtotal - discount), per person.
   * Positive rounds up, negative rounds down. Internal only - never shown, and
   * ignored when a manual total is set.
   */
  roundOff?: number;
  /** When set, replaces the calculated final per-person total entirely. */
  manualTotal?: number | null;
  /**
   * The party size. Used to divide a mixed stay's group total back to a single
   * per-person figure. One room choice for everyone leaves the maths unchanged,
   * so this is optional and defaults to a party of one.
   */
  pax?: number;
  /**
   * PKR per one unit of the quotation's currency (1 USD = 280 PKR -> 280). The
   * base rates are PKR; the subtotal is converted at this rate, then the
   * discount and round-off - which are given in the currency - are applied.
   * Defaults to 1 (PKR).
   */
  exchangeRate?: number;
  /** Decimal places for the currency; defaults to 0 for PKR, 2 otherwise. */
  decimals?: number;
}

export function calculateTotals(input: TotalsInput): QuotationTotals {
  const pax = Math.max(1, Math.round(input.pax ?? 1));
  const totalNights = input.stays.reduce((sum, stay) => sum + stay.nights, 0);

  const rate = Number.isFinite(input.exchangeRate) && (input.exchangeRate ?? 0) > 0 ? input.exchangeRate! : 1;
  const decimals = input.decimals ?? (rate === 1 ? 0 : 2);
  const roundMoney = (value: number): number => roundToDecimals(value, decimals);

  // Work in group totals - the whole party's rooms plus the whole party's air
  // fare - then divide once, so a mix never drifts from rounding stay by stay.
  const accommodationGroup = input.stays.reduce((sum, stay) => sum + stay.groupTotal, 0);
  const flightGroup = pax * Math.max(0, input.flightTotal ?? 0);
  const subtotalPkr = (accommodationGroup + flightGroup) / pax;

  // The base rates are PKR; convert to the quotation's currency, then take the
  // discount and round-off off in that currency (both are given in it).
  const subtotal = roundMoney(subtotalPkr / rate);

  const discount = clampDiscount(input.discount ?? 0, subtotal, roundMoney);
  const net = subtotal - discount;
  const manualOverride = input.manualTotal !== null && input.manualTotal !== undefined;

  // The rounding sits on top of the net, so a manual override (which sets the
  // final outright) leaves no net for it to adjust.
  const roundOff = manualOverride ? 0 : clampRoundOff(input.roundOff ?? 0, net, roundMoney);

  const finalTotal = manualOverride
    ? Math.max(0, roundMoney(input.manualTotal as number))
    : Math.max(0, roundMoney(net + roundOff));

  return { totalNights, subtotal, discount, roundOff, finalTotal, manualOverride };
}

/** A discount cannot be negative, nor larger than the subtotal. */
function clampDiscount(discount: number, subtotal: number, roundMoney: (v: number) => number): number {
  if (!Number.isFinite(discount) || discount <= 0) return 0;
  return Math.min(roundMoney(discount), subtotal);
}

/** Rounding may go either way, but never below a free price. */
function clampRoundOff(roundOff: number, net: number, roundMoney: (v: number) => number): number {
  if (!Number.isFinite(roundOff) || roundOff === 0) return 0;
  return roundMoney(Math.max(-net, roundOff));
}

/**
 * The two tidy figures nearest a net price and the signed step that reaches
 * each: `down` (<= 0) rounds to the previous multiple of `step`, `up` (>= 0) to
 * the next. A net already on a multiple yields zero on both sides. Drives the
 * builder's round-off suggestions.
 */
export function roundOffSuggestions(net: number, step = 1000): { down: number; up: number } {
  const base = Math.max(0, net);
  const size = Math.max(1, Math.round(step));
  // Keep two decimals so a foreign-currency net (1,428.57) yields a clean step.
  const clean = (value: number): number => Math.round(value * 100) / 100;
  return {
    down: clean(Math.floor(base / size) * size - base),
    up: clean(Math.ceil(base / size) * size - base),
  };
}

// ---------------------------------------------------------------- currency

export function formatPrice(amount: number): string {
  return `PKR ${Math.round(amount).toLocaleString("en-US")} /-`;
}

/** Convert a PKR amount into a currency's units. `rate` is PKR per one unit. */
export function convertFromPkr(pkr: number, rate: number): number {
  const r = Number.isFinite(rate) && rate > 0 ? rate : 1;
  return pkr / r;
}

/** Round to a currency's precision - whole rupees, or cents for a foreign one. */
export function roundToDecimals(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

/**
 * Money in the quotation's currency. PKR keeps its familiar "PKR X /-" form;
 * any other currency prints its code and its configured decimals, so a USD
 * quote reads "USD 1,374.96".
 */
export function formatMoney(
  amount: number,
  currency?: { code?: string; decimals?: number } | null,
): string {
  const code = currency?.code || "PKR";
  if (code === "PKR") return formatPrice(amount);
  const decimals = currency?.decimals ?? 2;
  const shown = amount.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  return `${code} ${shown}`;
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
