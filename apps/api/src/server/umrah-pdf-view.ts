/**
 * Umrah quotation document -> PDF payload.
 *
 * The same single door the Hajj quotation uses: fields are copied across by hand
 * into `buildPdfView`, so `discount`, `roundOff`, `subtotal` and the per-line
 * controls are simply never read and the target type has nowhere to put them.
 * The renderer, template, logo and the "Authorised Signature" line are the
 * existing ones - only the wording and the data differ.
 */

import {
  formatGregorian,
  formatGregorianRange,
  formatMoney,
  umrahPartyLine,
  type StyledLine,
} from "@junaidi/shared";
import { buildPdfView, loadLogoDataUri, type PdfCompany, type QuotationPdfView } from "@junaidi/pdf";

/** Only the parts of an Umrah quotation the customer's document is built from. */
export interface UmrahQuotationLike {
  quotationId: string;
  bookingRef?: string;
  date: Date | string;
  validUntil?: Date | string | null;
  packageTitle?: string;
  guest: { name: string; pax: number; withoutBedPax?: number; infants?: number };
  transportDisplay?: "included" | "separate";
  currency?: { code?: string; symbol?: string; decimals?: number } | null;
  stays: Array<{
    city: string;
    hotelName: string;
    distance?: string;
    checkIn: string;
    checkOut: string;
    nights: number;
    meal?: string;
    rateBasis?: "room" | "person";
    rooms?: Array<{ roomType: string; rooms: number; persons: number }>;
  }>;
  transportLegs?: Array<{ route: string; vehicle?: string }>;
  /** The legs' total in the quote currency; printed only when transport is a separate line. */
  transportTotal?: number;
  flight?: { included?: boolean; airline?: string; outbound?: string; inbound?: string } | null;
  charges?: Array<{ label: string }>;
  /** What prints: one entry per price. Each is already discounted and rounded. */
  priceLines: Array<{ key: string; label: string; finalTotal: number }>;
  includes?: Array<string | StyledLine>;
  requirements?: Array<string | StyledLine>;
  terms?: Array<string | StyledLine>;
  remarks?: string;
  createdByName?: string;
}

export interface UmrahPdfOptions {
  /** Print the letterhead. Off prints a neutral copy for a sub-agent. */
  branding?: boolean;
  /** The Umrah letterhead, from the admin settings. */
  company: PdfCompany;
}

function formatDate(value: Date | string | null | undefined): string {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  return date.toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" });
}

const two = (n: number): string => String(Math.max(0, Math.round(n))).padStart(2, "0");

/**
 * How the hotel column reads: "Emaar Al Khalil (1x Quad + 1x Double) · 500 mtrs".
 * A per-person rate names the room with how many guests it holds instead
 * ("Quad [04]"). Guests without a bed are added once, at the end of the rooms.
 * A room-types quote carries no rooms - its price cards name the room - so only
 * the hotel prints.
 */
function accommodationLabel(
  stay: UmrahQuotationLike["stays"][number],
  withoutBedPax: number,
): string {
  const rooms = (stay.rooms ?? []).filter((room) => room.roomType.trim());
  const parts = rooms.map((room) =>
    stay.rateBasis === "person" ? `${room.roomType.trim()} [${two(room.persons)}]` : `${room.rooms}x ${room.roomType.trim()}`,
  );
  if (rooms.length > 0 && withoutBedPax > 0) parts.push(`${two(withoutBedPax)} Without Bed`);

  const hotel = parts.length > 0 ? `${stay.hotelName} (${parts.join(" + ")})` : stay.hotelName;
  const distance = (stay.distance ?? "").trim();
  return distance ? `${hotel} · ${distance}` : hotel;
}

function travelNote(flight: UmrahQuotationLike["flight"]): string {
  if (!flight?.included) {
    return "Air ticket is not part of this package - the guest arranges their own travel.";
  }
  if (!(flight.inbound ?? "").trim()) {
    return "One-way ticket only - the return sector is not included in this package.";
  }
  return "";
}

/** Charge names in order, each once (case-insensitive), blanks dropped. */
function uniqueLabels(charges: Array<{ label: string }>): string[] {
  const seen = new Set<string>();
  const labels: string[] = [];
  for (const { label } of charges) {
    const text = label.trim();
    const key = text.toLowerCase();
    if (!text || seen.has(key)) continue;
    seen.add(key);
    labels.push(text);
  }
  return labels;
}

/** The sector line: "KHI - MED (Emirates)" - the airline only prints when named. */
function sector(text: string | undefined, airline: string | undefined): string {
  const route = (text ?? "").trim();
  if (!route) return "";
  const carrier = (airline ?? "").trim();
  return carrier ? `${route} (${carrier})` : route;
}

export async function toUmrahPdfView(
  quotation: UmrahQuotationLike,
  options: UmrahPdfOptions,
): Promise<QuotationPdfView> {
  const guest = quotation.guest;
  const withoutBedPax = guest.withoutBedPax ?? 0;
  const lines = quotation.priceLines;
  const main = lines[0];
  const legs = quotation.transportLegs ?? [];

  // The earliest check-in and the latest check-out head the document.
  const checkIns = quotation.stays.map((stay) => stay.checkIn).filter(Boolean).sort();
  const checkOuts = quotation.stays.map((stay) => stay.checkOut).filter(Boolean).sort();
  const flight = quotation.flight;
  const flightIncluded = Boolean(flight?.included);

  const transportSeparate = quotation.transportDisplay === "separate" && (quotation.transportTotal ?? 0) > 0;

  return buildPdfView({
    quotationId: quotation.quotationId,
    hbNumber: quotation.bookingRef ?? "",
    date: formatDate(quotation.date),
    guestName: umrahPartyLine(guest.name, {
      pax: guest.pax,
      withoutBedPax,
      infants: guest.infants ?? 0,
    }),
    validUntil: formatDate(quotation.validUntil),
    packageTitle: quotation.packageTitle ?? "",

    // Only already-final prices go across; nothing else about money is passed.
    totalPriceFormatted: formatMoney(main?.finalTotal ?? 0, quotation.currency),
    // One plain price when there is just the one; otherwise a card per price.
    tierPrices:
      lines.length === 1 && main?.key === "main"
        ? undefined
        : lines.map((line) => ({
            label: line.label,
            priceFormatted: formatMoney(line.finalTotal, quotation.currency),
          })),
    // A separately-charged transport total reads as the extra it is.
    addOns: transportSeparate
      ? [{ label: "Transportation Charges", amountFormatted: formatMoney(quotation.transportTotal ?? 0, quotation.currency) }]
      : undefined,

    travel: {
      included: flightIncluded,
      departureDate: checkIns[0] ? formatGregorian(checkIns[0]) : "",
      returnDate: checkOuts.length ? formatGregorian(checkOuts[checkOuts.length - 1]!) : "",
      outbound: flightIncluded ? sector(flight?.outbound, flight?.airline) : "",
      inbound: flightIncluded ? sector(flight?.inbound, flight?.airline) : "",
      note: travelNote(flight),
    },

    stays: quotation.stays.map((stay) => ({
      phase: stay.city,
      nights: `${two(stay.nights)} Nights`,
      dates: formatGregorianRange(stay.checkIn, stay.checkOut),
      datesSub: "",
      accommodation: accommodationLabel(stay, withoutBedPax),
      meal: stay.meal ?? "",
      mealNote: "",
    })),
    transport: legs.map((leg) => ({ route: leg.route, vehicle: leg.vehicle ?? "" })),
    labels: { bookingRef: "Booking No.", phaseHeader: "City", accommodationHeader: "Hotel / Rooms" },

    // Umrah has no Qurbani, Mina or Arafat services.
    qurbaniIncluded: false,

    // Extra charges (visa, ziyarat...) print by name only; their amounts are inside the price.
    // The same name can be charged twice (visa per adult, visa per infant) - print it once.
    includes: [...uniqueLabels(quotation.charges ?? []).map((text) => ({ text })), ...(quotation.includes ?? [])],
    requirements: quotation.requirements,
    terms: quotation.terms,
    remarks: quotation.remarks,

    generatedBy: quotation.createdByName ?? "",
    branding: options.branding ?? true,

    company: options.company,
    logoDataUri: await loadLogoDataUri(),
  });
}

export function umrahPdfFilename(quotation: { quotationId: string; guest: { name: string } }): string {
  const safe = quotation.guest.name.replace(/[^\w\s-]/g, "").trim().replace(/\s+/g, "_");
  return `${quotation.quotationId}_${safe || "Quotation"}.pdf`;
}
