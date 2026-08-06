/**
 * Quotation document -> PDF payload.
 *
 * This is the one place where a stored quotation becomes something the
 * renderer can see, and it copies fields across by hand. `discount`,
 * `discountNote` and `subtotal` are simply never read, and the target type has
 * nowhere to put them even if they were.
 */

import {
  formatGregorian,
  formatMoney,
  MINA_TIERS,
  minaCategoryLabel,
  roomLabel,
  type AziziyaRoomType,
  type Occupancy,
  type SharingWord,
  type StyledLine,
} from "@junaidi/shared";
import {
  DEFAULT_COMPANY,
  buildPdfView,
  loadLogoDataUri,
  type PdfTravel,
  type QuotationPdfView,
} from "@junaidi/pdf";

/** Only the parts of a quotation the customer's document is built from. */
interface QuotationLike {
  quotationId: string;
  /** The booking reference, set when confirmed. */
  hbNumber?: string;
  date: Date | string;
  validUntil?: Date | string | null;
  packageTitle?: string;
  packageCategory?: string;
  guest: { name: string; pax: number };
  totalNights: number;
  finalTotal: number;
  /** The currency the final is in; absent (or PKR) prints the familiar "PKR X /-". */
  currency?: { code?: string; symbol?: string; decimals?: number } | null;
  qurbaniIncluded?: boolean;
  flight?: {
    included?: boolean;
    returnRequired?: boolean;
    outbound?: { label?: string; airline?: string; origin?: string; destination?: string } | null;
    inbound?: { label?: string; airline?: string; origin?: string; destination?: string } | null;
  } | null;
  createdByName?: string;
  stays: Array<{
    blockLabelHijri: string;
    blockLabelGregorian?: string;
    /** "2027-05-07". Absent on quotations saved before travel dates existed. */
    blockStartGregorian?: string;
    blockEndGregorian?: string;
    locationName: string;
    locationType: string;
    accommodationName: string;
    minaTier?: string | null;
    /** This Mina option books no tent - print its name, not the Maktab. */
    withoutMina?: boolean;
    bedsPerTent?: number | null;
    roomType?: AziziyaRoomType | null;
    occupancy?: Occupancy | null;
    sharingWord?: SharingWord | null;
    /** Frozen at save time; falls back to deriving it for an unsaved preview. */
    roomLabel?: string;
    /** A mix of rooms in this stay (a family across room types). Empty = one room. */
    rooms?: Array<{
      accommodationName?: string;
      roomLabel?: string;
      roomType?: AziziyaRoomType | null;
      occupancy?: Occupancy | null;
      sharingWord?: SharingWord | null;
      /** For a Mina split: the tent's tier, and whether it books no tent. */
      minaTier?: string | null;
      withoutMina?: boolean | null;
      headcount: number;
    }>;
    meal?: string;
    mealNote?: string;
    nights: number;
    /** This stay spans the Hajj days, which follow as their own row. */
    coversHajj?: boolean;
  }>;
  // Strings (old quotations) or styled lines (new). Coerced by the PDF view.
  minaServices?: Array<string | StyledLine>;
  arafatServices?: Array<string | StyledLine>;
  includes?: Array<string | StyledLine>;
  includesNote?: string;
  requirements?: Array<string | StyledLine>;
  terms?: Array<string | StyledLine>;
  remarks?: string;
}

const PHASE_LABELS: Record<string, string> = {
  madinah: "Madinah Stay",
  makkah: "Makkah Stay",
  aziziya: "Aziziya Stay",
  mina: "Hajj Days",
  arafat: "Arafat",
};

/**
 * How the first column reads: just "Aziziya Stay" etc. A stay that spans the
 * Hajj days keeps its short name here; the "Including Hajj" note rides on the
 * nights sub-line instead, so the phase never wraps to a second line.
 */
function phaseLabel(stay: QuotationLike["stays"][number]): string {
  return PHASE_LABELS[stay.locationType] ?? `${stay.locationName} Stay`;
}

/** The nights sub-line: "10 Nights", or "10 Nights · Including Hajj" for a spanning stay. */
function nightsLabel(stay: QuotationLike["stays"][number]): string {
  if (stay.nights <= 0) return "";
  const nights = `${String(stay.nights).padStart(2, "0")} Nights`;
  return stay.coversHajj ? `${nights} · Including Hajj` : nights;
}

function formatDate(value: Date | string | null | undefined): string {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  return date.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

/**
 * How the accommodation column reads.
 *
 * Hotels and Aziziya carry their own room: "Sofitel Madinah Hotel (Sharing)",
 * "Aziziya Hotel (Separate - Triple)". The wording is frozen on the quotation
 * when it is saved, so a sent document never rewords itself.
 *
 * The Hajj row shows the Maktab category rather than the tent's internal name -
 * "Maktab A Category" is what the customer recognises. A package that books no
 * tent has no Maktab to name, so it prints that option's name instead. The tier
 * is optional and no longer decides this; "books no tent" does.
 */
/** "standard" -> "Standard". */
const capTier = (tier: string): string => (tier ? tier.charAt(0).toUpperCase() + tier.slice(1) : "");
/** Read a tier off an accommodation name, e.g. "Mina Premium" -> "Premium". */
const tierFromName = (name: string): string =>
  capTier(MINA_TIERS.find((t) => name.toLowerCase().includes(t)) ?? "");

/** The distinct Mina tiers on a Hajj row: ["Standard"], or ["Premium", "Deluxe"] for a mix. */
function minaTiers(stay: QuotationLike["stays"][number]): string[] {
  const rooms = stay.rooms ?? [];
  // A mix stores no tier per room, so read it off each tent's name.
  if (rooms.length > 1) {
    return [...new Set(rooms.map((r) => tierFromName(r.accommodationName ?? "")).filter(Boolean))];
  }
  // A single tent prefers its stored tier, falling back to its name (some tents
  // carry the tier only in the name, e.g. "Mina Standard B Category").
  const tier = stay.minaTier ? capTier(stay.minaTier) : tierFromName(stay.accommodationName);
  return tier ? [tier] : [];
}

/**
 * How the accommodation column reads when a stay holds a mix of rooms - a
 * family in one Sharing and one Triple, or two pilgrims in different Mina tiers.
 * Hotels share one name with the room sizes beside it; Mina lists each tier,
 * since the tiers are different accommodations.
 */
/** Two-digit people count, e.g. 3 -> "03". */
const paxTag = (headcount: number): string =>
  `[${String(Math.max(0, Math.round(headcount))).padStart(2, "0")}]`;

function roomMixLabel(stay: QuotationLike["stays"][number], packageCategory: string): string {
  const rooms = stay.rooms ?? [];
  if (stay.locationType === "mina") {
    // A Mina split names its categories directly, joined with " + ", exactly as
    // rooms do - "Premium[03] + Standard[01] + Without Mina[01]". "Without Mina"
    // is a category in its own right, so it is never dropped.
    const parts = rooms
      .map((room) => {
        const label =
          room.roomLabel ||
          minaCategoryLabel({
            minaTier: room.minaTier,
            withoutMina: room.withoutMina,
            accommodationName: room.accommodationName,
          });
        return label ? `${label} ${paxTag(room.headcount)}` : "";
      })
      .filter(Boolean);
    return parts.join(" + ");
  }
  const parts = rooms.map(
    (room) => `${room.roomLabel || roomLabel(room) || "Room"} ${paxTag(room.headcount)}`,
  );
  return `${stay.accommodationName} (${parts.join(" + ")})`;
}

/** "Maktab A Category (Standard)", or "(Premium + Deluxe)" when the tents are mixed. */
function minaLabel(stay: QuotationLike["stays"][number], packageCategory: string): string {
  if (stay.withoutMina) return stay.accommodationName;
  const tiers = minaTiers(stay);
  if (!packageCategory) {
    // The tent name already carries its tier; only a mix needs it spelled out.
    return tiers.length > 1 ? `${stay.accommodationName} (${tiers.join(" + ")})` : stay.accommodationName;
  }
  return tiers.length ? `${packageCategory} (${tiers.join(" + ")})` : packageCategory;
}

function accommodationLabel(
  stay: QuotationLike["stays"][number],
  packageCategory: string,
  dropRoom = false,
): string {
  // A genuine mix (two or more room entries) lists them, whatever the location.
  if (!dropRoom && stay.rooms && stay.rooms.length > 1) return roomMixLabel(stay, packageCategory);

  if (stay.locationType === "mina") return minaLabel(stay, packageCategory);

  // A package prints its room sizes as the tier price columns, so the itinerary
  // names only the hotel - "Aziziya Hotel", not "Aziziya Hotel (Sharing)".
  if (dropRoom) return stay.accommodationName;

  const room = stay.roomLabel || roomLabel(stay);
  return room ? `${stay.accommodationName} (${room})` : stay.accommodationName;
}

// The customer's document names the route only; the airline is an internal
// detail the agency does not print.
const sector = (
  leg: { origin?: string; destination?: string } | null | undefined,
): string => (leg ? `${leg.origin} - ${leg.destination}` : "");

/**
 * The journey as it heads the document: the day they leave and the day they
 * are back, plus the sectors when the ticket is ours to sell.
 *
 * The dates are the itinerary's own edges - the first block begins the day
 * they travel, the last one ends the day they return - so they are shown even
 * for a land-only package where the guest books their own flight.
 */
function travelDetails(quotation: QuotationLike): PdfTravel {
  // The earliest and latest day anywhere in the itinerary, not the first and
  // last row: a Hajj row nested inside a longer stay can sit last and would
  // otherwise cut the return short. ISO dates sort chronologically as text.
  const edge = (
    pick: (stay: QuotationLike["stays"][number]) => string | undefined,
    keep: (a: string, b: string) => boolean,
  ): string =>
    quotation.stays.reduce((best, stay) => {
      const value = pick(stay);
      if (!value) return best;
      return !best || keep(value, best) ? value : best;
    }, "");

  const departure = edge((stay) => stay.blockStartGregorian, (a, b) => a < b);
  const arrival = edge((stay) => stay.blockEndGregorian, (a, b) => a > b);

  const flight = quotation.flight;
  const included = Boolean(flight?.included);

  return {
    included,
    departureDate: departure ? formatGregorian(departure) : "",
    returnDate: arrival ? formatGregorian(arrival) : "",
    outbound: included ? sector(flight?.outbound) : "",
    inbound: included ? sector(flight?.inbound) : "",
    note: travelNote(quotation),
  };
}

function travelNote(quotation: QuotationLike): string {
  const flight = quotation.flight;
  if (!flight?.included) {
    return "Air ticket is not part of this package - the guest arranges their own travel.";
  }
  if (!flight.inbound) {
    return "One-way ticket only - the return sector is not included in this package.";
  }
  return "";
}

/** A package brochure differs from a customer quotation in a few small ways. */
export interface PdfViewOptions {
  /**
   * Render as a package: no reference number, the room type dropped from the
   * itinerary, and the tier prices below in place of one. The customer is
   * optional here - a name is shown only when one is entered.
   */
  asPackage?: boolean;
  /** A package's tier prices, each an already-final figure. */
  tierPrices?: Array<{ label: string; total: number }>;
  /** A package's per-room-type surcharges - every one it has, on offer or included. */
  addOns?: Array<{ label: string; amount: number; included: boolean }>;
  /** Print Junaidi's letterhead and signature. Defaults to on. */
  branding?: boolean;
}

export async function toPdfView(
  quotation: QuotationLike,
  options: PdfViewOptions = {},
): Promise<QuotationPdfView> {
  const asPackage = options.asPackage ?? false;

  const guestLine =
    quotation.guest.pax > 1
      ? `${quotation.guest.name} * ${String(quotation.guest.pax).padStart(2, "0")} PAX`
      : quotation.guest.name;

  return buildPdfView({
    // A package carries no reference number or booking - those belong to an
    // individual quotation, so the ID / HB rows drop out. The customer is
    // optional: an empty guest name simply hides the guest row.
    quotationId: asPackage ? "" : quotation.quotationId,
    hbNumber: asPackage ? "" : (quotation.hbNumber ?? ""),
    date: asPackage ? "" : formatDate(quotation.date),
    guestName: guestLine,
    validUntil: formatDate(quotation.validUntil),
    packageTitle: quotation.packageTitle ?? "",

    // The final, already-discounted figure, in the quotation's currency.
    // Nothing else about money is passed.
    totalPriceFormatted: formatMoney(quotation.finalTotal, quotation.currency),
    // Already converted to the quotation's currency by the caller - same
    // formatting rule as the main total, just per tier / per add-on line.
    tierPrices: options.tierPrices?.map((tier) => ({
      label: tier.label,
      priceFormatted: formatMoney(tier.total, quotation.currency),
    })),
    // "+PKR 400,000 /-" - a "+" since this is on top of the base room price.
    addOns: options.addOns?.map((addOn) => ({
      label: addOn.label,
      amountFormatted: `+${formatMoney(addOn.amount, quotation.currency)}`,
      included: addOn.included,
    })),

    travel: travelDetails(quotation),

    stays: quotation.stays.map((stay) => ({
      phase: phaseLabel(stay),
      nights: nightsLabel(stay),
      dates: stay.blockLabelHijri,
      datesSub: stay.blockLabelGregorian ?? "",
      accommodation: accommodationLabel(stay, quotation.packageCategory ?? "", asPackage),
      meal: stay.meal ?? "",
      mealNote: stay.mealNote ?? "",
    })),

    qurbaniIncluded: quotation.qurbaniIncluded ?? true,

    includes: quotation.includes,
    includesNote: quotation.includesNote,
    requirements: quotation.requirements,
    terms: quotation.terms,
    minaServices: quotation.minaServices,
    arafatServices: quotation.arafatServices,
    remarks: quotation.remarks,

    // Named in the page footer, so a customer knows who to call back.
    generatedBy: quotation.createdByName ?? "",

    // Junaidi's letterhead and signature print unless the staff member turned
    // branding off for this print - a neutral copy for a sub-agent.
    branding: options.branding ?? true,

    company: DEFAULT_COMPANY,
    logoDataUri: await loadLogoDataUri(),
  });
}

export function pdfFilename(quotation: { quotationId: string; guest: { name: string } }): string {
  const safe = quotation.guest.name.replace(/[^\w\s-]/g, "").trim().replace(/\s+/g, "_");
  return `${quotation.quotationId}_${safe || "Quotation"}.pdf`;
}
