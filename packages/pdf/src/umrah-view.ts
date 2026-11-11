/**
 * The only shape the Umrah PDF template is ever given.
 *
 * Like the Hajj `QuotationPdfView`, this is a firewall: the quotation's
 * discount, round-off, subtotal and internal notes have nowhere to go on this
 * type, and `buildUmrahPdfView` copies every field across by hand. The only
 * money it carries is already-final, already-formatted prices.
 */

import { toStyledLine, type StyledLine } from "@junaidi/shared";

import { DEFAULT_COMPANY, type PdfCompany } from "./view";

/** One printed price: a label and an already-final, already-formatted figure. */
export interface UmrahPdfPrice {
  label: string;
  price: string;
}

/**
 * How the prices print.
 *  - single: one figure ("Package price per person").
 *  - list:   a few labelled figures (Adult, Child, Infant ...).
 *  - matrix: room types down the side, Adult / Child across the top, with the
 *            prices that do not depend on a room type (without bed, infant) under it.
 */
export type UmrahPdfPrices =
  | { kind: "single"; caption: string; price: string }
  | { kind: "list"; caption: string; rows: UmrahPdfPrice[] }
  | {
      kind: "matrix";
      caption: string;
      columns: string[];
      rows: Array<{ label: string; cells: string[] }>;
      extras: UmrahPdfPrice[];
    };

/** One stop on the journey strip. */
export interface UmrahPdfStop {
  /** "Makkah", or "Departure" / "Return" for a flight end. */
  title: string;
  /** "05 nights", or the travel date for a flight end. */
  detail: string;
  /** Dates of a stay, or the sector of a flight end. */
  sub: string;
}

export interface UmrahPdfHotel {
  city: string;
  hotel: string;
  /** "1x Quad + 1x Double + 01 Without Bed". Empty when the price names the room. */
  rooms: string;
  distance: string;
  /** "8 May – 13 May 2027". */
  dates: string;
  /** "05". */
  nights: string;
  meal: string;
}

export interface UmrahPdfView {
  quotationId: string;
  /** Present once confirmed. Empty hides it. */
  bookingRef: string;
  date: string;
  validUntil: string;

  guestName: string;
  /** "3 Adults · 2 Children · 1 Infant · 1 without a bed". */
  party: string;
  packageTitle: string;
  /** "15": an Umrah package is sold by the day, one more than its nights. */
  totalDays: string;
  /** "8 May – 22 May 2027". */
  travelDates: string;

  ticketIncluded: boolean;
  departure: UmrahPdfStop;
  stops: UmrahPdfStop[];
  arrival: UmrahPdfStop;
  travelNote: string;

  hotels: UmrahPdfHotel[];
  flight: { airline: string; outbound: string; inbound: string } | null;
  transport: Array<{ route: string; vehicle: string }>;

  prices: UmrahPdfPrices;
  /** Charged on top of the prices, e.g. transport shown separately. */
  addOns: UmrahPdfPrice[];

  includes: StyledLine[];
  requirements: StyledLine[];
  terms: StyledLine[];
  remarks: string;

  generatedBy: string;
  /** Print the letterhead. Off prints a neutral copy for a sub-agent. */
  branding: boolean;
  company: PdfCompany;
  logoDataUri: string;
}

export type UmrahPdfViewInput = Omit<
  UmrahPdfView,
  "includes" | "requirements" | "terms" | "company" | "logoDataUri" | "bookingRef" | "generatedBy" | "remarks"
> & {
  bookingRef?: string;
  includes?: Array<string | StyledLine>;
  requirements?: Array<string | StyledLine>;
  terms?: Array<string | StyledLine>;
  remarks?: string;
  generatedBy?: string;
  company?: PdfCompany;
  logoDataUri?: string;
};

const text = (value: string | undefined): string => (value ?? "").trim();

const cleanLines = (items: Array<string | StyledLine> | undefined): StyledLine[] =>
  (items ?? [])
    .map((item) => toStyledLine(item))
    .map((line) => ({ text: line.text.trim(), color: line.color ?? "", bold: line.bold ?? false }))
    .filter((line) => line.text.length > 0);

const price = (entry: UmrahPdfPrice): UmrahPdfPrice => ({ label: text(entry.label), price: text(entry.price) });

const stop = (entry: UmrahPdfStop): UmrahPdfStop => ({
  title: text(entry.title),
  detail: text(entry.detail),
  sub: text(entry.sub),
});

function copyPrices(prices: UmrahPdfPrices): UmrahPdfPrices {
  switch (prices.kind) {
    case "single":
      return { kind: "single", caption: text(prices.caption), price: text(prices.price) };
    case "list":
      return { kind: "list", caption: text(prices.caption), rows: prices.rows.map(price) };
    case "matrix":
      return {
        kind: "matrix",
        caption: text(prices.caption),
        columns: prices.columns.map((column) => text(column)),
        rows: prices.rows.map((row) => ({ label: text(row.label), cells: row.cells.map((cell) => text(cell)) })),
        extras: prices.extras.map(price),
      };
  }
}

/** The single door between an Umrah quotation and its template. Every field is copied by name. */
export function buildUmrahPdfView(input: UmrahPdfViewInput): UmrahPdfView {
  return {
    quotationId: text(input.quotationId),
    bookingRef: text(input.bookingRef),
    date: text(input.date),
    validUntil: text(input.validUntil),

    guestName: text(input.guestName),
    party: text(input.party),
    packageTitle: text(input.packageTitle),
    totalDays: text(input.totalDays),
    travelDates: text(input.travelDates),

    ticketIncluded: input.ticketIncluded,
    departure: stop(input.departure),
    stops: input.stops.map(stop),
    arrival: stop(input.arrival),
    travelNote: text(input.travelNote),

    hotels: input.hotels.map((hotel) => ({
      city: text(hotel.city),
      hotel: text(hotel.hotel),
      rooms: text(hotel.rooms),
      distance: text(hotel.distance),
      dates: text(hotel.dates),
      nights: text(hotel.nights),
      meal: text(hotel.meal),
    })),
    flight: input.flight
      ? { airline: text(input.flight.airline), outbound: text(input.flight.outbound), inbound: text(input.flight.inbound) }
      : null,
    transport: input.transport
      .map((leg) => ({ route: text(leg.route), vehicle: text(leg.vehicle) }))
      .filter((leg) => leg.route.length > 0),

    prices: copyPrices(input.prices),
    addOns: input.addOns.map(price).filter((addOn) => addOn.label.length > 0),

    includes: cleanLines(input.includes),
    requirements: cleanLines(input.requirements),
    terms: cleanLines(input.terms),
    remarks: text(input.remarks),

    generatedBy: text(input.generatedBy),
    branding: input.branding,
    company: input.company ?? DEFAULT_COMPANY,
    logoDataUri: input.logoDataUri ?? "",
  };
}
