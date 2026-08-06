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

import { toStyledLine, type StyledLine } from "@junaidi/shared";

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
  /** The brand name; its first word prints red, the rest black. */
  name: string;
  /** Small line under the name, e.g. "TRAVEL & TOURS". */
  subheading: string;
  tagline: string;
  address: string;
  contact: string;
  /** Social links for the header icons; an empty string hides that icon. */
  social: { facebook: string; instagram: string; youtube: string; whatsapp?: string };
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
  name: "JUNAIDI GROUP",
  subheading: "",
  tagline: "",
  address: "Suite No. 7-8, Mona Square, Jahangir Road, Gurumandir, Karachi",
  contact: "Phone: 021-34130184-87 | E-Mail: contact@junaidigroup.com",
  social: {
    facebook: "http://www.facebook.com/Junaidigroup/",
    instagram: "https://www.instagram.com/junaidiairtravel",
    youtube: "https://www.youtube.com/@Junaidi-Group",
    whatsapp: "+92 323 427101",
  },
};

/**
 * One printed tier price. Like the single total, this is the ONLY money shape
 * the renderer sees for a package: a label and an already-final, already-
 * formatted figure. The discount and calculated value stay behind, exactly as
 * they do for a quotation's single price.
 */
export interface PdfTierPrice {
  /** "Quad", "Triple", "Double". */
  label: string;
  /** "PKR 3,650,000 /-" — already discounted, already formatted. */
  priceFormatted: string;
}

/** A per-room-type surcharge line printed under a package's itinerary. */
export interface PdfAddOn {
  /** "Aziziya Triple Bed". */
  label: string;
  /** "+PKR 200,000 /-" — already formatted. */
  amountFormatted: string;
  /** Priced into the tier totals and marked apart from the merely-on-offer ones. */
  included: boolean;
}

export interface QuotationPdfView {
  quotationId: string;
  /** The booking (HB) reference, present only once confirmed. Empty hides it. */
  hbNumber: string;
  date: string;
  guestName: string;
  validUntil: string;
  /** "Hajj 2027/1448 - Maktab A Category - 28 Days Package (Customize)". */
  packageTitle: string;

  /** "PKR 919,000 /-" — the single price, when not printing tiers. */
  totalPrice: string;
  /**
   * A package's two or three prices for one itinerary. When present, these
   * replace the single `totalPrice` panel. Empty for a customer quotation.
   */
  tierPrices: PdfTierPrice[];
  /** Package add-on surcharges, printed as a band under the itinerary. */
  addOns: PdfAddOn[];

  travel: PdfTravel;
  stays: PdfStayRow[];
  qurbaniIncluded: boolean;

  includes: StyledLine[];
  includesNote: string;
  requirements: StyledLine[];
  terms: StyledLine[];

  minaServices: StyledLine[];
  arafatServices: StyledLine[];
  /** The box is printed even when empty, as space to write in. */
  remarks: string;

  /** Staff member named in the page footer. Empty hides the line. */
  generatedBy: string;

  /**
   * Print Junaidi's own marks - the letterhead (logo, name, address, contact,
   * socials) and the name atop page 2. Off produces a neutral document for a
   * sub-agent to stamp; the "Powered by Digitli" footer is a software mark, not
   * Junaidi's, and stays either way. The signature line reads "Authorised
   * Signature" whichever way this is set.
   */
  branding: boolean;

  company: PdfCompany;
  /** data: URI, embedded so the page needs no network. */
  logoDataUri: string;
}

/** Everything `buildPdfView` accepts. Note the absence of anything internal. */
export interface PdfViewInput {
  quotationId: string;
  hbNumber?: string;
  date: string;
  guestName: string;
  validUntil: string;
  packageTitle: string;
  /** Pass the FINAL price only — already discounted, already formatted. */
  totalPriceFormatted: string;
  /** A package's tier prices, each already final and formatted. Omit for a quotation. */
  tierPrices?: PdfTierPrice[];
  /** A package's add-on surcharges, each already formatted. Omit for a quotation. */
  addOns?: Array<{ label: string; amountFormatted: string; included?: boolean }>;
  travel?: Partial<PdfTravel>;
  stays: PdfStayRow[];
  qurbaniIncluded?: boolean;
  includes?: Array<string | StyledLine>;
  includesNote?: string;
  requirements?: Array<string | StyledLine>;
  terms?: Array<string | StyledLine>;
  minaServices?: Array<string | StyledLine>;
  arafatServices?: Array<string | StyledLine>;
  remarks?: string;
  generatedBy?: string;
  /** Print Junaidi's letterhead and signature. Defaults to on. */
  branding?: boolean;
  company?: PdfCompany;
  logoDataUri?: string;
}

/** Coerce plain strings or styled lines to trimmed, non-empty styled lines. */
const cleanLines = (items: Array<string | StyledLine> | undefined): StyledLine[] =>
  (items ?? [])
    .map((item) => toStyledLine(item))
    .map((line) => ({ text: line.text.trim(), color: line.color ?? "", bold: line.bold ?? false }))
    .filter((line) => line.text.length > 0);

const text = (value: string | undefined): string => (value ?? "").trim();

export function buildPdfView(input: PdfViewInput): QuotationPdfView {
  return {
    quotationId: input.quotationId.trim(),
    hbNumber: text(input.hbNumber),
    date: input.date.trim(),
    guestName: input.guestName.trim(),
    validUntil: input.validUntil.trim(),
    packageTitle: input.packageTitle.trim(),

    totalPrice: input.totalPriceFormatted.trim(),
    tierPrices: (input.tierPrices ?? []).map((tier) => ({
      label: tier.label.trim(),
      priceFormatted: tier.priceFormatted.trim(),
    })),
    addOns: (input.addOns ?? [])
      .map((addOn) => ({
        label: addOn.label.trim(),
        amountFormatted: addOn.amountFormatted.trim(),
        included: addOn.included ?? false,
      }))
      .filter((addOn) => addOn.label.length > 0),

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

    includes: cleanLines(input.includes),
    includesNote: (input.includesNote ?? "").trim(),
    requirements: cleanLines(input.requirements),
    terms: cleanLines(input.terms),

    minaServices: cleanLines(input.minaServices),
    arafatServices: cleanLines(input.arafatServices),
    remarks: text(input.remarks),

    generatedBy: text(input.generatedBy),

    branding: input.branding ?? true,

    company: input.company ?? DEFAULT_COMPANY,
    logoDataUri: input.logoDataUri ?? "",
  };
}
