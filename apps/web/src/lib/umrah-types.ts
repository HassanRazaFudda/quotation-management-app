/**
 * Response shapes for the Umrah API, mirroring the stored document. Kept apart
 * from `types.ts` so nothing about Hajj quotations is widened by Umrah's fields.
 */

import type {
  StyledLine,
  UmrahChargeBasis,
  UmrahPriceDisplay,
  UmrahPricingMode,
  UmrahRateBasis,
  UmrahTier,
  UmrahTransportDisplay,
} from "@junaidi/shared";

import type { QuotationPayment } from "./types";

export interface UmrahRoomLineDoc {
  roomType: string;
  rooms: number;
  persons: number;
  rate: number;
}

export interface UmrahStayDoc {
  city: string;
  hotelName: string;
  distance: string;
  checkIn: string;
  checkOut: string;
  nights: number;
  meal: string;
  currencyCode: string;
  rateBasis: UmrahRateBasis;
  rooms: UmrahRoomLineDoc[];
  tierRates: Record<UmrahTier, number | null>;
  withoutBedRate: number;
  cost: number;
}

export interface UmrahLegDoc {
  route: string;
  isCustomRoute: boolean;
  vehicle: string;
  cost: number;
  currencyCode: string;
}

export interface UmrahChargeDoc {
  label: string;
  amount: number;
  currencyCode: string;
  basis: UmrahChargeBasis;
}

export interface UmrahLineSettingDoc {
  key: string;
  offered: boolean;
  discount: number;
  roundOff: number;
  manualTotal: number | null;
}

export interface UmrahPriceLineDoc {
  key: string;
  label: string;
  count: number;
  groupTotal: number;
  subtotal: number;
  discount: number;
  roundOff: number;
  finalTotal: number;
  manualOverride: boolean;
}

export type UmrahStatus = "draft" | "sent" | "confirmed" | "expired";

export interface UmrahQuotation {
  _id: string;
  quotationId: string;
  year: string;
  status: UmrahStatus;
  bookingRef: string;
  assignedStaff?: { userId: string | null; name: string };
  guest: { name: string; pax: number; withoutBedPax: number; infants: number };
  date: string;
  validUntil: string | null;
  packageTitle: string;
  pricingMode: UmrahPricingMode;
  priceDisplay: UmrahPriceDisplay;
  transportDisplay: UmrahTransportDisplay;
  currency: { code: string; symbol: string; decimals: number };
  exchangeRates: Array<{ code: string; rate: number }>;
  stays: UmrahStayDoc[];
  transportLegs: UmrahLegDoc[];
  flight: {
    included: boolean;
    airline: string;
    outbound: string;
    inbound: string;
    adultFare: number;
    infantFare: number;
    currencyCode: string;
  };
  charges: UmrahChargeDoc[];
  lineSettings: UmrahLineSettingDoc[];
  priceLines: UmrahPriceLineDoc[];
  totalNights: number;
  transportTotal: number;
  grandTotal: number;
  finalTotal: number;
  discountNote: string;
  includes: StyledLine[];
  requirements: StyledLine[];
  terms: StyledLine[];
  remarks: string;
  payments?: QuotationPayment[];
  createdBy: string;
  createdByName: string;
  createdAt: string;
  updatedAt: string;
  /** Set when the list was grouped: the band this row belongs to. */
  groupLabel?: string;
}

export interface UmrahQuotationList {
  items: UmrahQuotation[];
  total: number;
  page: number;
  pageSize: number;
  pages: number;
}

export interface UmrahSettings {
  company: {
    name: string;
    subheading: string;
    tagline: string;
    address: string;
    contact: string;
    social: { facebook: string; instagram: string; youtube: string; whatsapp: string };
  };
  defaults: { includes: StyledLine[]; requirements: StyledLine[]; terms: StyledLine[] };
}
