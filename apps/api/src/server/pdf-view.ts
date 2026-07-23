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
    bedsPerTent?: number | null;
    roomType?: AziziyaRoomType | null;
    occupancy?: Occupancy | null;
    sharingWord?: SharingWord | null;
    /** Frozen at save time; falls back to deriving it for an unsaved preview. */
    roomLabel?: string;
    meal?: string;
    mealNote?: string;
    nights: number;
  }>;
  minaServices?: string[];
  arafatServices?: string[];
  includes?: string[];
  includesNote?: string;
  requirements?: string[];
  terms?: string[];
  remarks?: string;
}

const PHASE_LABELS: Record<string, string> = {
  madinah: "Madinah Stay",
  makkah: "Makkah Stay",
  aziziya: "Aziziya Stay",
  mina: "Hajj Days",
  arafat: "Arafat",
};

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
 * The Hajj row shows the Maktab category rather than the internal tent tier -
 * "Maktab A Category" is what the customer recognises. A package that books no
 * tent has no Maktab to name, so it says so instead.
 */
function accommodationLabel(
  stay: QuotationLike["stays"][number],
  packageCategory: string,
): string {
  if (stay.locationType === "mina") {
    if (!stay.minaTier) return stay.accommodationName;
    return packageCategory || stay.accommodationName;
  }

  const room = stay.roomLabel || roomLabel(stay);
  return room ? `${stay.accommodationName} (${room})` : stay.accommodationName;
}

const sector = (
  leg: { origin?: string; destination?: string; airline?: string } | null | undefined,
): string => (leg ? `${leg.origin} - ${leg.destination}${leg.airline ? ` (${leg.airline})` : ""}` : "");

/**
 * The journey as it heads the document: the day they leave and the day they
 * are back, plus the sectors when the ticket is ours to sell.
 *
 * The dates are the itinerary's own edges - the first block begins the day
 * they travel, the last one ends the day they return - so they are shown even
 * for a land-only package where the guest books their own flight.
 */
function travelDetails(quotation: QuotationLike): PdfTravel {
  const first = quotation.stays[0];
  const last = quotation.stays[quotation.stays.length - 1];
  const flight = quotation.flight;
  const included = Boolean(flight?.included);

  return {
    included,
    departureDate: first?.blockStartGregorian ? formatGregorian(first.blockStartGregorian) : "",
    returnDate: last?.blockEndGregorian ? formatGregorian(last.blockEndGregorian) : "",
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

export async function toPdfView(quotation: QuotationLike): Promise<QuotationPdfView> {
  const guestLine = quotation.guest.pax > 1
    ? `${quotation.guest.name} * ${String(quotation.guest.pax).padStart(2, "0")} PAX`
    : quotation.guest.name;

  return buildPdfView({
    quotationId: quotation.quotationId,
    date: formatDate(quotation.date),
    guestName: guestLine,
    validUntil: formatDate(quotation.validUntil),
    packageTitle: quotation.packageTitle ?? "",

    // The final, already-discounted figure. Nothing else about money is passed.
    totalPriceFormatted: formatPrice(quotation.finalTotal),

    travel: travelDetails(quotation),

    stays: quotation.stays.map((stay) => ({
      phase: PHASE_LABELS[stay.locationType] ?? `${stay.locationName} Stay`,
      nights: stay.nights > 0 ? `${String(stay.nights).padStart(2, "0")} Nights` : "",
      dates: stay.blockLabelHijri,
      datesSub: stay.blockLabelGregorian ?? "",
      accommodation: accommodationLabel(stay, quotation.packageCategory ?? ""),
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
