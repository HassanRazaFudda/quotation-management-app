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

/** One bullet on the quotation, with the styling frozen at save time. */
const styledLineSchema = new Schema(
  {
    text: { type: String, required: true },
    color: { type: String, default: "" },
    bold: { type: Boolean, default: false },
  },
  { _id: false },
);

/** One room in a mixed stay: its own accommodation, room choice and headcount,
 *  with the name and label frozen so a sent PDF never rewords itself. */
const roomEntrySchema = new Schema(
  {
    accommodationId: { type: Schema.Types.ObjectId, ref: "Accommodation", required: true },
    accommodationName: { type: String, default: "" },
    roomType: { type: String, enum: [...AZIZIYA_ROOM_TYPES, null], default: null },
    occupancy: { type: String, enum: [...OCCUPANCIES, null], default: null },
    sharingWord: { type: String, enum: [...SHARING_WORDS, null], default: null },
    /** These people share a room without their own bed, at the no-bed rate. */
    withoutBed: { type: Boolean, default: false },
    /** A Mina split entry: the tent's tier, and whether it books no tent. */
    minaTier: { type: String, default: null },
    withoutMina: { type: Boolean, default: false },
    /**
     * "Quad", "Triple", "Without bed" for a room; "Standard", "Deluxe",
     * "Without Mina" for a Mina tier - what the PDF prints for this entry.
     */
    roomLabel: { type: String, default: "" },
    headcount: { type: Number, required: true, min: 0 },
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
    /** This Mina option books no tent; the PDF prints its name, not the Maktab. */
    withoutMina: { type: Boolean, default: false },
    bedsPerTent: { type: Number, default: null },
    // The room is chosen per stay: shared in Makkah, private in Aziziya is normal.
    roomType: { type: String, enum: [...AZIZIYA_ROOM_TYPES, null], default: null },
    occupancy: { type: String, enum: [...OCCUPANCIES, null], default: null },
    /** Print an exact size instead of "Sharing" on this row. Display only. */
    sharingWord: { type: String, enum: [...SHARING_WORDS, null], default: null },
    /** What the PDF prints: "Sharing" / "Quint" / "Separate - Triple". */
    roomLabel: { type: String, default: "" },
    // The label is what the PDF prints (frozen); the id lets the builder restore
    // the exact choice when the quotation is edited or duplicated.
    meal: { type: String, default: "" },
    mealId: { type: Schema.Types.ObjectId, ref: "Meal", default: null },
    mealNote: { type: String, default: "" },
    mealNoteId: { type: Schema.Types.ObjectId, ref: "MealNote", default: null },
    /**
     * This stay spans the Hajj days, which are listed again as their own row.
     * Frozen here so re-dating a block next month cannot reword a sent PDF.
     */
    coversHajj: { type: Boolean, default: false },

    /**
     * A mix of rooms in this one stay - a family across a Quad and a Triple, or
     * two pilgrims in different Mina tiers. Each entry is frozen with its own
     * name, label and count so the PDF can list them. Empty (the common case)
     * means the whole party shares the single room choice above.
     */
    rooms: {
      type: [roomEntrySchema],
      default: [],
    },

    nights: { type: Number, required: true, min: 0 },
    rateSnapshot: { type: Number, required: true, min: 0 },
    lineTotal: { type: Number, required: true, min: 0 },
    /** The whole party's room cost for this stay. */
    groupTotal: { type: Number, default: 0, min: 0 },
  },
  { _id: false },
);

/**
 * A payment taken against a confirmed booking. Each entry freezes its own rate
 * and the amount it converts to in the quotation currency, so money already
 * received never shifts when a rate later changes. Keeps its own `_id` so a
 * single entry can be corrected or removed.
 */
const paymentSchema = new Schema(
  {
    date: { type: Date, required: true },
    /** The amount as received, in `paymentCurrency`. */
    amount: { type: Number, required: true, min: 0 },
    paymentCurrency: { type: String, default: "PKR", trim: true },
    /** Quotation-currency units per one payment-currency unit; 1 when the same. */
    exchangeRate: { type: Number, default: 1, min: 0 },
    /** `amount x exchangeRate`, frozen, in the quotation currency. */
    convertedAmount: { type: Number, required: true, min: 0 },
    method: { type: String, default: "", trim: true },
    notes: { type: String, default: "" },
    /** The sales staff who received it: a system user, or a free-typed name. */
    receivedByUserId: { type: Schema.Types.ObjectId, ref: "User", default: null },
    receivedByName: { type: String, default: "", trim: true },
    /** Who entered the record, for audit. */
    recordedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
    recordedByName: { type: String, default: "", trim: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
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
    /**
     * The primary staff member handling this booking, set on confirmation. A
     * system user (name snapshotted) or a free-typed name. Defaults the sales
     * staff on a payment.
     */
    assignedStaff: {
      userId: { type: Schema.Types.ObjectId, ref: "User", default: null },
      name: { type: String, default: "" },
    },

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

    minaServices: { type: [styledLineSchema], default: [] },
    arafatServices: { type: [styledLineSchema], default: [] },
    includes: { type: [styledLineSchema], default: [] },
    includesNote: { type: String, default: "" },
    requirements: { type: [styledLineSchema], default: [] },
    terms: { type: [styledLineSchema], default: [] },
    remarks: { type: String, default: "" },

    // The labelled lines above are what the PDF prints (frozen). These id lists
    // are kept only so editing or duplicating can restore the exact selection.
    minaServiceIds: [{ type: Schema.Types.ObjectId, ref: "ServiceItem" }],
    arafatServiceIds: [{ type: Schema.Types.ObjectId, ref: "ServiceItem" }],
    includeIds: [{ type: Schema.Types.ObjectId, ref: "ServiceItem" }],
    requirementIds: [{ type: Schema.Types.ObjectId, ref: "ServiceItem" }],
    termIds: [{ type: Schema.Types.ObjectId, ref: "ServiceItem" }],

    totalNights: { type: Number, default: 0 },
    subtotal: { type: Number, default: 0 },

    /**
     * The currency this quotation is priced in, frozen at save so a later rate
     * change never alters a sent quote. Base rates are PKR; the rate is how many
     * PKR one unit costs. All money below (subtotal, discount, finalTotal ...)
     * is in this currency; the per-stay line totals stay PKR and convert on show.
     */
    currency: {
      code: { type: String, default: "PKR" },
      symbol: { type: String, default: "PKR" },
      decimals: { type: Number, default: 0 },
    },
    exchangeRate: { type: Number, default: 1 },

    /** Internal only. Never rendered on the customer's PDF. */
    discount: { type: Number, default: 0, min: 0 },
    discountNote: { type: String, default: "" },
    /** Signed rounding adjustment on the net. Internal, like the discount. */
    roundOff: { type: Number, default: 0 },

    finalTotal: { type: Number, default: 0 },
    manualOverride: { type: Boolean, default: false },

    /** Payments taken against this booking (only meaningful once confirmed). */
    payments: { type: [paymentSchema], default: [] },

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
