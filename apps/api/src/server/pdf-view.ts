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
  formatPrice,
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
 * How the first column reads.
 *
 * A stay that spans the Hajj days says so - "Aziziya Including Hajj Days" -
 * because the guest keeps that room while they are in Mina, and the Hajj row
 * printed under it carries the Maktab rather than a second hotel.
 */
function phaseLabel(stay: QuotationLike["stays"][number]): string {
  const base = PHASE_LABELS[stay.locationType] ?? `${stay.locationName} Stay`;
  if (!stay.coversHajj) return base;

  return `${base.replace(/\s*Stay$/, "")} Including Hajj Days`;
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
function accommodationLabel(
  stay: QuotationLike["stays"][number],
  packageCategory: string,
  dropRoom = false,
): string {
  if (stay.locationType === "mina") {
    if (stay.withoutMina) return stay.accommodationName;
    return packageCategory || stay.accommodationName;
  }

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
    return "Air ticket is not part of this package — the guest arranges their own travel.";
  }
  if (!flight.inbound) {
    return "One-way ticket only — the return sector is not included in this package.";
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
  /** A package's per-room-type surcharges. */
  addOns?: Array<{ label: string; amount: number }>;
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

    // The final, already-discounted figure. Nothing else about money is passed.
    totalPriceFormatted: formatPrice(quotation.finalTotal),
    tierPrices: options.tierPrices?.map((tier) => ({
      label: tier.label,
      priceFormatted: formatPrice(tier.total),
    })),
    addOns: options.addOns?.map((addOn) => ({
      label: addOn.label,
      amountFormatted: formatPrice(addOn.amount),
    })),

    travel: travelDetails(quotation),

    stays: quotation.stays.map((stay) => ({
      phase: phaseLabel(stay),
      nights: stay.nights > 0 ? `${String(stay.nights).padStart(2, "0")} Nights` : "",
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

    company: DEFAULT_COMPANY,
    logoDataUri: await loadLogoDataUri(),
  });
}

export function pdfFilename(quotation: { quotationId: string; guest: { name: string } }): string {
  const safe = quotation.guest.name.replace(/[^\w\s-]/g, "").trim().replace(/\s+/g, "_");
  return `${quotation.quotationId}_${safe || "Quotation"}.pdf`;
}
