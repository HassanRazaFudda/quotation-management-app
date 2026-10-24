/**
 * An Umrah quotation.
 *
 * Everything on it was typed in by the agent - rates, transport, fares - so there
 * is no admin configuration for it to drift from. It deliberately lives in its
 * own collection and imports nothing from the Hajj quotation or its rate,
 * accommodation and date-block models: a Hajj rate can never reach an Umrah
 * price, and a change to one module cannot reprice the other.
 *
 * `discount`, `roundOff` and the per-line controls are internal. They never leave
 * through the PDF - see `@junaidi/pdf`'s view type, which has no field for them.
 */

import {
  UMRAH_CHARGE_BASES,
  UMRAH_PRICE_DISPLAYS,
  UMRAH_PRICING_MODES,
  UMRAH_RATE_BASES,
  UMRAH_TRANSPORT_DISPLAYS,
} from "@junaidi/shared";
import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

export const UMRAH_QUOTATION_STATUSES = ["draft", "sent", "confirmed", "expired"] as const;
export type UmrahQuotationStatus = (typeof UMRAH_QUOTATION_STATUSES)[number];

const styledLineSchema = new Schema(
  {
    text: { type: String, required: true },
    color: { type: String, default: "" },
    bold: { type: Boolean, default: false },
  },
  { _id: false },
);

const roomLineSchema = new Schema(
  {
    roomType: { type: String, required: true, trim: true },
    rooms: { type: Number, default: 1, min: 0 },
    persons: { type: Number, default: 0, min: 0 },
    rate: { type: Number, default: 0, min: 0 },
  },
  { _id: false },
);

const staySchema = new Schema(
  {
    city: { type: String, required: true, trim: true },
    hotelName: { type: String, required: true, trim: true },
    distance: { type: String, default: "", trim: true },
    /** "yyyy-mm-dd", kept as text so a timezone can never move a night. */
    checkIn: { type: String, required: true },
    checkOut: { type: String, required: true },
    nights: { type: Number, required: true, min: 1 },
    meal: { type: String, default: "", trim: true },
    currencyCode: { type: String, required: true, trim: true, uppercase: true },
    rateBasis: { type: String, enum: [...UMRAH_RATE_BASES], default: "room" },
    rooms: { type: [roomLineSchema], default: [] },
    tierRates: {
      Quad: { type: Number, default: null },
      Triple: { type: Number, default: null },
      Double: { type: Number, default: null },
    },
    withoutBedRate: { type: Number, default: 0, min: 0 },
    /** The with-bed guests' room cost for this stay, in the quote currency. Frozen. */
    cost: { type: Number, default: 0, min: 0 },
  },
  { _id: false },
);

const legSchema = new Schema(
  {
    route: { type: String, required: true, trim: true },
    isCustomRoute: { type: Boolean, default: false },
    vehicle: { type: String, default: "", trim: true },
    cost: { type: Number, default: 0, min: 0 },
    currencyCode: { type: String, required: true, trim: true, uppercase: true },
  },
  { _id: false },
);

const chargeSchema = new Schema(
  {
    label: { type: String, required: true, trim: true },
    amount: { type: Number, default: 0, min: 0 },
    currencyCode: { type: String, required: true, trim: true, uppercase: true },
    basis: { type: String, enum: [...UMRAH_CHARGE_BASES], default: "perPerson" },
  },
  { _id: false },
);

/** What the agent typed for one printed price, kept so the form can be restored. */
const lineSettingSchema = new Schema(
  {
    key: { type: String, required: true },
    offered: { type: Boolean, default: true },
    discount: { type: Number, default: 0, min: 0 },
    roundOff: { type: Number, default: 0 },
    manualTotal: { type: Number, default: null, min: 0 },
  },
  { _id: false },
);

/** One printed price as it was worked out at save time. Frozen. */
const priceLineSchema = new Schema(
  {
    key: { type: String, required: true },
    label: { type: String, required: true },
    count: { type: Number, required: true, min: 1 },
    groupTotal: { type: Number, default: 0 },
    subtotal: { type: Number, default: 0 },
    /** Internal only. */
    discount: { type: Number, default: 0 },
    roundOff: { type: Number, default: 0 },
    finalTotal: { type: Number, default: 0 },
    manualOverride: { type: Boolean, default: false },
  },
  { _id: false },
);

/**
 * A payment taken against a confirmed booking. Deliberately the same fields as a
 * Hajj payment (so the payment logic is shared) but a separate schema, so this
 * file imports nothing from the Hajj quotation model.
 */
const paymentSchema = new Schema(
  {
    date: { type: Date, required: true },
    amount: { type: Number, required: true, min: 0 },
    paymentCurrency: { type: String, default: "PKR", trim: true },
    exchangeRate: { type: Number, default: 1, min: 0 },
    convertedAmount: { type: Number, required: true, min: 0 },
    method: { type: String, default: "", trim: true },
    notes: { type: String, default: "" },
    receivedByUserId: { type: Schema.Types.ObjectId, ref: "User", default: null },
    receivedByName: { type: String, default: "", trim: true },
    recordedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
    recordedByName: { type: String, default: "", trim: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

const umrahQuotationSchema = new Schema(
  {
    quotationId: { type: String, required: true, unique: true, trim: true },
    /** Gregorian year of the quotation date - Umrah's equivalent of a season. */
    year: { type: String, required: true, trim: true },
    status: { type: String, enum: [...UMRAH_QUOTATION_STATUSES], default: "draft" },
    /** The booking number, set when confirmed. Unique among Umrah bookings. */
    bookingRef: { type: String, default: "", trim: true },
    assignedStaff: {
      userId: { type: Schema.Types.ObjectId, ref: "User", default: null },
      name: { type: String, default: "" },
    },

    guest: {
      name: { type: String, required: true, trim: true },
      /** Guests with a bed. */
      pax: { type: Number, default: 1, min: 1 },
      withoutBedPax: { type: Number, default: 0, min: 0 },
      infants: { type: Number, default: 0, min: 0 },
    },

    date: { type: Date, required: true },
    validUntil: { type: Date, default: null },
    packageTitle: { type: String, default: "" },

    pricingMode: { type: String, enum: [...UMRAH_PRICING_MODES], default: "single" },
    priceDisplay: { type: String, enum: [...UMRAH_PRICE_DISPLAYS], default: "average" },
    transportDisplay: { type: String, enum: [...UMRAH_TRANSPORT_DISPLAYS], default: "included" },

    /** Everything below is shown in this currency. */
    currency: {
      code: { type: String, default: "PKR" },
      symbol: { type: String, default: "PKR" },
      decimals: { type: Number, default: 0 },
    },
    /** PKR per unit of every currency used, frozen at save. PKR itself is implicit. */
    exchangeRates: {
      type: [new Schema({ code: { type: String, required: true }, rate: { type: Number, required: true, min: 0 } }, { _id: false })],
      default: [],
    },

    stays: { type: [staySchema], default: [] },
    transportLegs: { type: [legSchema], default: [] },
    flight: {
      included: { type: Boolean, default: false },
      airline: { type: String, default: "", trim: true },
      outbound: { type: String, default: "", trim: true },
      inbound: { type: String, default: "", trim: true },
      adultFare: { type: Number, default: 0, min: 0 },
      infantFare: { type: Number, default: 0, min: 0 },
      currencyCode: { type: String, default: "PKR", trim: true, uppercase: true },
    },
    charges: { type: [chargeSchema], default: [] },

    lineSettings: { type: [lineSettingSchema], default: [] },
    priceLines: { type: [priceLineSchema], default: [] },

    totalNights: { type: Number, default: 0 },
    transportTotal: { type: Number, default: 0 },
    /** The whole booking, for payments. 0 for a room-types quote. */
    grandTotal: { type: Number, default: 0 },
    /** The main printed price per person, for lists. */
    finalTotal: { type: Number, default: 0 },
    discountNote: { type: String, default: "" },

    includes: { type: [styledLineSchema], default: [] },
    requirements: { type: [styledLineSchema], default: [] },
    terms: { type: [styledLineSchema], default: [] },
    remarks: { type: String, default: "" },

    payments: { type: [paymentSchema], default: [] },

    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    createdByName: { type: String, default: "" },
  },
  { timestamps: true },
);

umrahQuotationSchema.index({ createdBy: 1, createdAt: -1 });
umrahQuotationSchema.index({ year: 1, status: 1, createdAt: -1 });
umrahQuotationSchema.index({ "guest.name": "text", quotationId: "text" });
// One booking number per booking. Partial so the many unconfirmed "" do not clash.
umrahQuotationSchema.index(
  { bookingRef: 1 },
  { unique: true, partialFilterExpression: { bookingRef: { $gt: "" } } },
);

export const UmrahQuotationModel: Model<InferSchemaType<typeof umrahQuotationSchema>> =
  (mongoose.models.UmrahQuotation as Model<InferSchemaType<typeof umrahQuotationSchema>>) ??
  mongoose.model("UmrahQuotation", umrahQuotationSchema);
