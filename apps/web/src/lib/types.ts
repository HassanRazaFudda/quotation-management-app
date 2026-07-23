/** Shapes returned by the API, mirrored for the client. */

import type { ConfigBundle, SharingWord } from "@junaidi/shared";

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
  bedsPerTent: number | null;
  roomType: "sharing" | "separate" | null;
  occupancy: "Quad" | "Triple" | "Double" | null;
  sharingWord: SharingWord | null;
  roomLabel: string;
  meal: string;
  mealNote: string;
  nights: number;
  rateSnapshot: number;
  lineTotal: number;
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
  minaServices: string[];
  arafatServices: string[];
  includes: string[];
  includesNote: string;
  requirements: string[];
  terms: string[];
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
}

export interface QuotationList {
  items: Quotation[];
  total: number;
  page: number;
  pageSize: number;
  pages: number;
}
