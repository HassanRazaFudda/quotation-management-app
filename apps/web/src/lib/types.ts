/** Shapes returned by the API, mirrored for the client. */

import type { ConfigBundle, Currency, PackageAddOn, SharingWord, StyledLine } from "@junaidi/shared";

export type { Currency, StyledLine };

/** The currency a quotation is priced in, frozen at save. PKR is the base. */
export interface QuotationCurrency {
  code: string;
  symbol: string;
  decimals: number;
}

export interface SessionUser {
  userId: string;
  email: string;
  name: string;
  role: "admin" | "staff";
}

export interface LoginResponse {
  token: string;
  user: SessionUser;
}

export interface ConfigProblem {
  kind: string;
  message: string;
}

export type BootstrapResponse = ConfigBundle & { problems: ConfigProblem[] };

export interface CalculateLine {
  blockId: string;
  label: string;
  gregorian: string | null;
  nights: number;
  rate: number;
  lineTotal: number;
}

export interface CalculateResponse {
  totalNights: number;
  currency: QuotationCurrency;
  exchangeRate: number;
  subtotal: number;
  discount: number;
  roundOff: number;
  finalTotal: number;
  finalTotalFormatted: string;
  manualOverride: boolean;
  warnings: string[];
  lines: CalculateLine[];
}

export interface QuotationStay {
  blockId: string;
  locationId: string;
  accommodationId: string;
  blockLabelHijri: string;
  blockLabelGregorian: string;
  locationName: string;
  locationType: string;
  accommodationName: string;
  minaTier: string | null;
  /** This Mina option books no tent. */
  withoutMina?: boolean;
  bedsPerTent: number | null;
  roomType: "sharing" | "separate" | null;
  occupancy: string | null;
  sharingWord: SharingWord | null;
  roomLabel: string;
  /** A mix of rooms in this stay; empty (the common case) means one room choice. */
  rooms?: Array<{
    accommodationId: string;
    accommodationName?: string;
    roomType: "sharing" | "separate" | null;
    occupancy: string | null;
    sharingWord: SharingWord | null;
    withoutBed?: boolean | null;
    /** For a Mina split: the tent's tier, and whether it books no tent. */
    minaTier?: string | null;
    withoutMina?: boolean | null;
    roomLabel?: string;
    headcount: number;
  }>;
  meal: string;
  /** Set on newer quotations, so editing/duplicating can restore the choice. */
  mealId: string | null;
  mealNote: string;
  mealNoteId: string | null;
  nights: number;
  rateSnapshot: number;
  lineTotal: number;
  /** This stay spans the Hajj days, listed again as their own row. */
  coversHajj?: boolean;
}

/** A payment recorded against a confirmed quotation (in the quotation currency once converted). */
export interface QuotationPayment {
  _id: string;
  date: string;
  amount: number;
  paymentCurrency: string;
  exchangeRate: number;
  convertedAmount: number;
  method: string;
  notes: string;
  receivedByUserId: string | null;
  receivedByName: string;
  recordedByName: string;
  createdAt: string;
}

export interface QuotationFlight {
  included: boolean;
  returnRequired: boolean;
  outbound: { optionId?: string; label: string; airline: string; origin: string; destination: string; price: number } | null;
  inbound: { optionId?: string; label: string; airline: string; origin: string; destination: string; price: number } | null;
  total: number;
}

export interface Quotation {
  _id: string;
  quotationId: string;
  season: string;
  status: "draft" | "sent" | "confirmed" | "expired";
  /** The unique booking reference, set when the quotation is confirmed. */
  hbNumber: string;
  /** The primary staff handling the booking, set on confirmation. */
  assignedStaff?: { userId: string | null; name: string };
  guest: { name: string; pax: number };
  date: string;
  validUntil: string | null;
  packageTitle: string;
  packageCategory: string;
  withoutMina: boolean;
  qurbaniIncluded: boolean;
  stays: QuotationStay[];
  flight: QuotationFlight;
  minaServices: StyledLine[];
  arafatServices: StyledLine[];
  includes: StyledLine[];
  includesNote: string;
  requirements: StyledLine[];
  terms: StyledLine[];
  /** Selection ids, so editing/duplicating can restore the ticked services. */
  minaServiceIds?: string[];
  arafatServiceIds?: string[];
  includeIds?: string[];
  requirementIds?: string[];
  termIds?: string[];
  remarks: string;
  totalNights: number;
  /**
   * The currency this quotation is priced in (frozen). PKR is the base.
   * Optional: quotations saved before currencies existed carry neither field.
   */
  currency?: QuotationCurrency;
  exchangeRate?: number;
  subtotal: number;
  discount: number;
  discountNote: string;
  /** Signed rounding adjustment on the net. Internal, admin-visible only. */
  roundOff: number;
  finalTotal: number;
  manualOverride: boolean;
  /** Payments taken against this booking; present once confirmed. */
  payments?: QuotationPayment[];
  createdBy: string;
  createdByName: string;
  createdAt: string;
  updatedAt: string;
  /** Set when the list was grouped: the band this row belongs to. */
  groupLabel?: string;
}

export interface QuotationList {
  items: Quotation[];
  total: number;
  page: number;
  pageSize: number;
  pages: number;
}

/** Someone who has written a quotation. */
export interface QuotationAuthor {
  userId: string;
  name: string;
}

/** A predefined package: a quotation shape staff can start from. */
export interface Package {
  _id: string;
  name: string;
  season: string;
  packageTitle: string;
  packageCategory: string;
  withoutMina: boolean;
  qurbaniIncluded: boolean;
  minaAccommodationId: string | null;
  stays: Array<{
    blockId: string;
    locationId: string;
    accommodationId: string;
    roomType: "sharing" | "separate" | null;
    occupancy: string | null;
    sharingWord: SharingWord | null;
    mealId: string | null;
    mealNoteId: string | null;
  }>;
  flight: {
    included: boolean;
    returnRequired: boolean;
    roundTrip?: boolean;
    outboundId: string | null;
    inboundId: string | null;
    roundTripId?: string | null;
  };
  minaServiceIds: string[];
  arafatServiceIds: string[];
  includeIds: string[];
  requirementIds: string[];
  termIds: string[];
  includesNote: string;
  remarks: string;
  /** The currency this package is authored and printed in. Defaults to PKR. */
  currencyCode?: string;
  /** Package-only three-price pricing; a tier left null is not offered. */
  tierPricing?: {
    enabled: boolean;
    Quad: { manualTotal: number | null; discount: number } | null;
    Triple: { manualTotal: number | null; discount: number } | null;
    Double: { manualTotal: number | null; discount: number } | null;
  };
  /** Per-room-type surcharges printed under the itinerary. */
  addOns?: PackageAddOn[];
  createdAt: string;
  updatedAt: string;
}
