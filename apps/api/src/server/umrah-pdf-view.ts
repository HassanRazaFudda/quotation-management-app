/**
 * Umrah quotation document -> PDF payload.
 *
 * Umrah has its own template (`buildUmrahHtml`), kept apart from the Hajj one so
 * the two documents never look alike. The door is the same kind: fields are
 * copied across by hand into `buildUmrahPdfView`, so `discount`, `roundOff`,
 * `subtotal` and the per-line controls are never read and the target type has
 * nowhere to put them. The signature line reads "Authorised Signature".
 */

import {
  formatGregorian,
  formatGregorianRange,
  formatMoney,
  umrahParty,
  UMRAH_TIERS,
  type StyledLine,
} from "@junaidi/shared";
import {
  buildUmrahPdfView,
  loadLogoDataUri,
  type PdfCompany,
  type UmrahPdfPrices,
  type UmrahPdfView,
} from "@junaidi/pdf";

/** Only the parts of an Umrah quotation the customer's document is built from. */
export interface UmrahQuotationLike {
  quotationId: string;
  bookingRef?: string;
  date: Date | string;
  validUntil?: Date | string | null;
  packageTitle?: string;
  guest: {
    name: string;
    pax: number;
    withoutBedPax?: number;
    infants?: number;
    children?: number;
    withoutBedChildren?: number;
  };
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
 * The rooms under a hotel's name: "1x Quad + 1x Double + 01 Without Bed". A
 * per-person rate names the room with how many guests it holds ("Quad [04]").
 * Guests without a bed are added once, at the end. A room-types quote carries
 * no rooms - its price table names the room - so nothing prints.
 */
function roomsLabel(stay: UmrahQuotationLike["stays"][number], withoutBedPax: number): string {
  const rooms = (stay.rooms ?? []).filter((room) => room.roomType.trim());
  const parts = rooms.map((room) =>
    stay.rateBasis === "person" ? `${room.roomType.trim()} [${two(room.persons)}]` : `${room.rooms}x ${room.roomType.trim()}`,
  );
  if (rooms.length > 0 && withoutBedPax > 0) parts.push(`${two(withoutBedPax)} Without Bed`);
  return parts.join(" + ");
}

const plural = (count: number, one: string, many: string): string => `${count} ${count === 1 ? one : many}`;

/** "3 Adults · 2 Children · 1 Infant · 1 without a bed". */
function partyText(guest: UmrahQuotationLike["guest"]): string {
  const withoutBed = guest.withoutBedPax ?? 0;
  const party = umrahParty({
    pax: guest.pax,
    withoutBedPax: withoutBed,
    infants: guest.infants ?? 0,
    children: guest.children ?? 0,
    withoutBedChildren: guest.withoutBedChildren ?? 0,
  });
  const parts =
    party.children > 0
      ? [plural(party.adults, "Adult", "Adults"), plural(party.children, "Child", "Children")]
      : [plural(party.adults, "Guest", "Guests")];
  if (party.infants > 0) parts.push(plural(party.infants, "Infant", "Infants"));
  if (withoutBed > 0) parts.push(`${withoutBed} without a bed`);
  return parts.join(" · ");
}

const PRICE_CAPTION = "Package price per person";

/**
 * The printed prices. Room types become a table (type down the side, Adult and
 * Child across); one plain price prints as one figure; anything else is a list.
 */
function pricesOf(lines: UmrahQuotationLike["priceLines"], currency: UmrahQuotationLike["currency"]): UmrahPdfPrices {
  const money = (amount: number) => formatMoney(amount, currency);
  const tiers = UMRAH_TIERS as readonly string[];
  const isTierKey = (key: string) => tiers.includes(key.split(":")[0]!);
  const tierLines = lines.filter((line) => isTierKey(line.key));

  if (tierLines.length > 0) {
    const byKey = new Map(lines.map((line) => [line.key, line]));
    const withChild = tierLines.some((line) => line.key.endsWith(":child"));
    const rows = UMRAH_TIERS.filter((tier) => byKey.has(tier) || byKey.has(`${tier}:child`)).map((tier) => {
      const cell = (key: string) => {
        const line = byKey.get(key);
        return line ? money(line.finalTotal) : "";
      };
      return { label: tier, cells: withChild ? [cell(tier), cell(`${tier}:child`)] : [cell(tier)] };
    });
    return {
      kind: "matrix",
      caption: PRICE_CAPTION,
      columns: withChild ? ["Adult", "Child"] : ["Per person"],
      rows,
      extras: lines
        .filter((line) => !isTierKey(line.key))
        .map((line) => ({ label: line.label, price: money(line.finalTotal) })),
    };
  }

  const main = lines[0];
  if (lines.length === 1 && main?.key === "main") {
    return { kind: "single", caption: PRICE_CAPTION, price: money(main.finalTotal) };
  }
  return {
    kind: "list",
    caption: PRICE_CAPTION,
    rows: lines.map((line) => ({ label: line.label, price: money(line.finalTotal) })),
  };
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
): Promise<UmrahPdfView> {
  const guest = quotation.guest;
  const withoutBedPax = guest.withoutBedPax ?? 0;
  const stays = quotation.stays;

  // The earliest check-in and the latest check-out bound the trip.
  const checkIns = stays.map((stay) => stay.checkIn).filter(Boolean).sort();
  const checkOuts = stays.map((stay) => stay.checkOut).filter(Boolean).sort();
  const first = checkIns[0] ?? "";
  const last = checkOuts[checkOuts.length - 1] ?? "";
  const flight = quotation.flight;
  const flightIncluded = Boolean(flight?.included);
  const totalNights = stays.reduce((sum, stay) => sum + (stay.nights ?? 0), 0);

  const transportSeparate = quotation.transportDisplay === "separate" && (quotation.transportTotal ?? 0) > 0;

  return buildUmrahPdfView({
    quotationId: quotation.quotationId,
    bookingRef: quotation.bookingRef ?? "",
    date: formatDate(quotation.date),
    validUntil: formatDate(quotation.validUntil),

    guestName: guest.name,
    party: partyText(guest),
    packageTitle: quotation.packageTitle ?? "",
    // sold by the day: 14 nights is a "15 days" package, as the builder titles it
    totalDays: String(totalNights > 0 ? totalNights + 1 : 0),
    travelDates: first && last ? formatGregorianRange(first, last) : "",

    ticketIncluded: flightIncluded,
    departure: {
      title: "Departure",
      detail: first ? formatGregorian(first) : "",
      sub: flightIncluded ? sector(flight?.outbound, flight?.airline) : "",
    },
    stops: stays.map((stay) => ({
      title: stay.city,
      detail: `${two(stay.nights)} nights`,
      sub: formatGregorianRange(stay.checkIn, stay.checkOut),
    })),
    arrival: {
      title: "Return",
      detail: last ? formatGregorian(last) : "",
      sub: flightIncluded ? sector(flight?.inbound, flight?.airline) : "",
    },
    travelNote: travelNote(flight),

    hotels: stays.map((stay) => ({
      city: stay.city,
      hotel: stay.hotelName,
      rooms: roomsLabel(stay, withoutBedPax),
      distance: stay.distance ?? "",
      dates: formatGregorianRange(stay.checkIn, stay.checkOut),
      nights: two(stay.nights),
      meal: stay.meal ?? "",
    })),
    flight: flightIncluded
      ? { airline: flight?.airline ?? "", outbound: flight?.outbound ?? "", inbound: flight?.inbound ?? "" }
      : null,
    transport: (quotation.transportLegs ?? []).map((leg) => ({ route: leg.route, vehicle: leg.vehicle ?? "" })),

    // Only already-final prices go across; nothing else about money is passed.
    prices: pricesOf(quotation.priceLines, quotation.currency),
    // A separately-charged transport total reads as the extra it is.
    addOns: transportSeparate
      ? [{ label: "transportation charges", price: formatMoney(quotation.transportTotal ?? 0, quotation.currency) }]
      : [],

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
