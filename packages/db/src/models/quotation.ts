/**
 * A quotation.
 *
 * Names, labels and rates are copied onto the document rather than referenced,
 * because a quotation is a document already sent to a customer: renaming a
 * hotel or changing a rate next month must not rewrite what was quoted.
 *
 * `discount` and `discountNote` are internal. They are reported to the admin
 * and never leave through the PDF - see `@junaidi/pdf`'s view type, which has
 * no field capable of carrying them.
 */

import { AZIZIYA_ROOM_TYPES, MINA_TIERS, OCCUPANCIES, SHARING_WORDS } from "@junaidi/shared";
import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

export const QUOTATION_STATUSES = [
  "draft",
  "sent",
  "confirmed",
  "expired",
] as const;
export type QuotationStatus = (typeof QUOTATION_STATUSES)[number];

/** A sector as sold, frozen so a fare change never rewrites a sent quotation. */
const flightSnapshotSchema = new Schema(
  {
    optionId: { type: Schema.Types.ObjectId, ref: "Flight" },
    label: { type: String, default: "" },
    airline: { type: String, default: "" },
    origin: { type: String, default: "" },
    destination: { type: String, default: "" },
    price: { type: Number, default: 0 },
  },
  { _id: false },
);

const staySchema = new Schema(
  {
    // References, kept for reporting.
    blockId: { type: Schema.Types.ObjectId, ref: "DateBlock", required: true },
    locationId: { type: Schema.Types.ObjectId, ref: "Location", required: true },
    accommodationId: {
      type: Schema.Types.ObjectId,
      ref: "Accommodation",
      required: true,
    },

    // Snapshots, so the quotation never changes under the customer.
    blockLabelHijri: { type: String, required: true },
    blockLabelGregorian: { type: String, default: "" },
    /** "2027-05-07" — kept raw so the travel dates can be read off the ends. */
    blockStartGregorian: { type: String, default: "" },
    blockEndGregorian: { type: String, default: "" },
    locationName: { type: String, required: true },
    locationType: { type: String, required: true },
    accommodationName: { type: String, required: true },
    minaTier: { type: String, enum: [...MINA_TIERS, null], default: null },
    bedsPerTent: { type: Number, default: null },
    // The room is chosen per stay: shared in Makkah, private in Aziziya is normal.
    roomType: { type: String, enum: [...AZIZIYA_ROOM_TYPES, null], default: null },
    occupancy: { type: String, enum: [...OCCUPANCIES, null], default: null },
    /** Print an exact size instead of "Sharing" on this row. Display only. */
    sharingWord: { type: String, enum: [...SHARING_WORDS, null], default: null },
    /** What the PDF prints: "Sharing" / "Quint" / "Separate - Triple". */
    roomLabel: { type: String, default: "" },
    meal: { type: String, default: "" },
    mealNote: { type: String, default: "" },

    nights: { type: Number, required: true, min: 0 },
    rateSnapshot: { type: Number, required: true, min: 0 },
    lineTotal: { type: Number, required: true, min: 0 },
  },
  { _id: false },
);

const quotationSchema = new Schema(
  {
    quotationId: { type: String, required: true, unique: true, trim: true },
    season: { type: String, required: true, trim: true },
    status: {
      type: String,
      enum: [...QUOTATION_STATUSES],
      default: "draft",
    },
    /**
     * The booking (Hajj Booking) number, set when a quotation is confirmed.
     * Unique across all bookings - the same HB number cannot sit on two.
     */
    hbNumber: { type: String, default: "", trim: true },

    guest: {
      name: { type: String, required: true, trim: true },
      pax: { type: Number, default: 1, min: 1 },
    },

    date: { type: Date, required: true },
    validUntil: { type: Date, default: null },
    packageTitle: { type: String, default: "" },
    /** Package-level label, e.g. "Maktab A Category". Stored as text. */
    packageCategory: { type: String, default: "" },

    withoutMina: { type: Boolean, default: false },
    /** Qurbani is part of the package by default. */
    qurbaniIncluded: { type: Boolean, default: true },

    stays: { type: [staySchema], default: [] },

    /** Air travel. `included: false` leaves the guest to arrange their own. */
    flight: {
      included: { type: Boolean, default: false },
      returnRequired: { type: Boolean, default: true },
      outbound: { type: flightSnapshotSchema, default: null },
      inbound: { type: flightSnapshotSchema, default: null },
      total: { type: Number, default: 0 },
    },

    minaServices: [{ type: String }],
    arafatServices: [{ type: String }],
    includes: [{ type: String }],
    includesNote: { type: String, default: "" },
    requirements: [{ type: String }],
    terms: [{ type: String }],
    remarks: { type: String, default: "" },

    totalNights: { type: Number, default: 0 },
    subtotal: { type: Number, default: 0 },

    /** Internal only. Never rendered on the customer's PDF. */
    discount: { type: Number, default: 0, min: 0 },
    discountNote: { type: String, default: "" },

    finalTotal: { type: Number, default: 0 },
    manualOverride: { type: Boolean, default: false },

    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    createdByName: { type: String, default: "" },
  },
  { timestamps: true },
);

// Staff list their own work; admin reports slice by person and date.
quotationSchema.index({ createdBy: 1, createdAt: -1 });
quotationSchema.index({ season: 1, status: 1, createdAt: -1 });
quotationSchema.index({ "guest.name": "text", quotationId: "text" });
// One HB number per booking. Partial so the many unconfirmed "" do not clash.
quotationSchema.index(
  { hbNumber: 1 },
  { unique: true, partialFilterExpression: { hbNumber: { $gt: "" } } },
);

export const QuotationModel: Model<InferSchemaType<typeof quotationSchema>> =
  (mongoose.models.Quotation as Model<InferSchemaType<typeof quotationSchema>>) ??
  mongoose.model("Quotation", quotationSchema);
