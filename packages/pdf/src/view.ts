/**
 * The only shape the PDF renderer is ever given.
 *
 * A quotation carries a discount, a subtotal and internal notes. The customer
 * must see none of that — no discount line, no subtotal, no strikethrough,
 * just one price. Rather than relying on the template to "remember" not to
 * print it, the discount simply does not exist on this type.
 *
 * `buildPdfView` is the single door between a quotation and the renderer, and
 * it copies fields across explicitly. Adding a field to the quotation cannot
 * leak it into the PDF by accident.
 */

export interface PdfStayRow {
  /** "Madinah Stay", "Hajj Days" ... */
  phase: string;
  /** "05 Nights" — already formatted, or empty to omit the line. */
  nights: string;
  /** Hijri block label, e.g. "07 Zilhaj - 12 Zilhaj". */
  dates: string;
  /** Gregorian range, shown small under the Hijri dates. Empty to omit. */
  datesSub: string;
  /** Hotel or Mina tent, e.g. "Mina Deluxe (7-8 beds)". */
  accommodation: string;
  meal: string;
  /** Parenthesised sub-line under the meal. Empty to omit. */
  mealNote: string;
}

export interface PdfCompany {
  name: string;
  tagline: string;
  address: string;
  contact: string;
}

/**
 * The journey, as the customer reads it: the day they leave, the day they come
 * back, and the sectors flown in between.
 *
 * The dates come from the itinerary itself — the first block starts the day
 * they travel and the last one ends the day they return — so they are shown
 * even when the guest arranges their own ticket.
 */
export interface PdfTravel {
  /** Is the air ticket sold as part of this package? */
  included: boolean;
  /** "13 June 2027". Empty when the calendar has not been imported. */
  departureDate: string;
  returnDate: string;
  /** "Karachi - Jeddah (PIA)". Empty when the guest books their own. */
  outbound: string;
  inbound: string;
  /** A single line under the cards, e.g. "One-way ticket only." */
  note: string;
}

/** The agency behind the software. Printed small, on every page. */
export const POWERED_BY = {
  name: "Digitli",
  url: "www.digitli.com",
  contact: "+92 317 2036604",
} as const;

export const DEFAULT_COMPANY: PdfCompany = {
  name: "JUNAIDI AIR TRAVELS",
  tagline: "HAJJ & UMRAH SERVICES",
  address: "Suite No. 7-8, Mona Square, Jahangir Road, Gurumandir, Karachi",
  contact: "Phone: 021-34130184-87 | E-Mail: junaiditravels@gmail.com",
};

export interface QuotationPdfView {
  quotationId: string;
  date: string;
  guestName: string;
  validUntil: string;
  /** "Hajj 2027/1448 - Maktab A Category - 28 Days Package (Customize)". */
  packageTitle: string;

  /** "PKR 919,000 /-" — the only money on the page. */
  totalPrice: string;

  travel: PdfTravel;
  stays: PdfStayRow[];
  qurbaniIncluded: boolean;

  includes: string[];
  includesNote: string;
  requirements: string[];
  terms: string[];

  minaServices: string[];
  arafatServices: string[];
  /** The box is printed even when empty, as space to write in. */
  remarks: string;

  /** Staff member named in the page footer. Empty hides the line. */
  generatedBy: string;

  company: PdfCompany;
  /** data: URI, embedded so the page needs no network. */
  logoDataUri: string;
}

/** Everything `buildPdfView` accepts. Note the absence of anything internal. */
export interface PdfViewInput {
  quotationId: string;
  date: string;
  guestName: string;
  validUntil: string;
  packageTitle: string;
  /** Pass the FINAL price only — already discounted, already formatted. */
  totalPriceFormatted: string;
  travel?: Partial<PdfTravel>;
  stays: PdfStayRow[];
  qurbaniIncluded?: boolean;
  includes?: string[];
  includesNote?: string;
  requirements?: string[];
  terms?: string[];
  minaServices?: string[];
  arafatServices?: string[];
  remarks?: string;
  generatedBy?: string;
  company?: PdfCompany;
  logoDataUri?: string;
}

const clean = (items: string[] | undefined): string[] =>
  (items ?? []).map((item) => item.trim()).filter(Boolean);

const text = (value: string | undefined): string => (value ?? "").trim();

export function buildPdfView(input: PdfViewInput): QuotationPdfView {
  return {
    quotationId: input.quotationId.trim(),
    date: input.date.trim(),
    guestName: input.guestName.trim(),
    validUntil: input.validUntil.trim(),
    packageTitle: input.packageTitle.trim(),

    totalPrice: input.totalPriceFormatted.trim(),

    travel: {
      included: input.travel?.included ?? false,
      departureDate: text(input.travel?.departureDate),
      returnDate: text(input.travel?.returnDate),
      outbound: text(input.travel?.outbound),
      inbound: text(input.travel?.inbound),
      note: text(input.travel?.note),
    },

    stays: input.stays,
    qurbaniIncluded: input.qurbaniIncluded ?? true,

    includes: clean(input.includes),
    includesNote: (input.includesNote ?? "").trim(),
    requirements: clean(input.requirements),
    terms: clean(input.terms),

    minaServices: clean(input.minaServices),
    arafatServices: clean(input.arafatServices),
    remarks: text(input.remarks),

    generatedBy: text(input.generatedBy),

    company: input.company ?? DEFAULT_COMPANY,
    logoDataUri: input.logoDataUri ?? "",
  };
}
