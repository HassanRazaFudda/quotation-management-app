/** Shapes returned by the API, mirrored for the client. */

import type { ConfigBundle, SharingWord, StyledLine } from "@junaidi/shared";

export type { StyledLine };

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
  subtotal: number;
  discount: number;
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
  occupancy: "Quad" | "Triple" | "Double" | null;
  sharingWord: SharingWord | null;
  roomLabel: string;
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

export interface QuotationFlight {
  included: boolean;
  returnRequired: boolean;
  outbound: { label: string; airline: string; origin: string; destination: string; price: number } | null;
  inbound: { label: string; airline: string; origin: string; destination: string; price: number } | null;
  total: number;
}

export interface Quotation {
  _id: string;
  quotationId: string;
  season: string;
  status: "draft" | "sent" | "confirmed" | "expired";
  /** The unique booking reference, set when the quotation is confirmed. */
  hbNumber: string;
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
  subtotal: number;
  discount: number;
  discountNote: string;
  finalTotal: number;
  manualOverride: boolean;
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
    occupancy: "Quad" | "Triple" | "Double" | null;
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
  createdAt: string;
  updatedAt: string;
}
