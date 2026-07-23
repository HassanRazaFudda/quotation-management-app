/**
 * Everything the admin configures.
 *
 * These collections are the reason the system is self-serve: date blocks,
 * where a stay is allowed, which hotels, which meals and what they cost all
 * live here rather than in code.
 */

import {
  FLIGHT_DIRECTIONS,
  HIJRI_MONTHS,
  LOCATION_TYPES,
  MINA_TIERS,
  OCCUPANCIES,
  PRICING_MODELS,
  SHARING_WORDS,
  SERVICE_CATEGORIES,
  BLOCK_PHASES,
} from "@junaidi/shared";
import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

/** Reuse an existing compiled model, or compile it. Needed for hot reload. */
function model<TSchema extends Schema>(
  name: string,
  schema: TSchema,
): Model<InferSchemaType<TSchema>> {
  return (mongoose.models[name] as Model<InferSchemaType<TSchema>>) ??
    mongoose.model<InferSchemaType<TSchema>>(name, schema);
}

const timestamps = { timestamps: true } as const;

// ---------------------------------------------------------------- location

const locationSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    type: { type: String, required: true, enum: [...LOCATION_TYPES] },
    pricingModel: { type: String, required: true, enum: [...PRICING_MODELS] },
    sortOrder: { type: Number, default: 0 },
    active: { type: Boolean, default: true },
  },
  timestamps,
);

locationSchema.index({ active: 1, sortOrder: 1 });

export const LocationModel = model("Location", locationSchema);

// ----------------------------------------------------------- accommodation

const accommodationSchema = new Schema(
  {
    locationId: { type: Schema.Types.ObjectId, ref: "Location", required: true },
    name: { type: String, required: true, trim: true },

    // Mina only.
    minaTier: { type: String, enum: [...MINA_TIERS, null], default: null },
    bedsPerTent: { type: Number, default: null },
    /** The Mina option that books no tent. Still priced: Muallim, transport. */
    withoutMina: { type: Boolean, default: false },

    /** Room sizes (rates) this hotel has. Empty means all of them. */
    allowedOccupancies: [{ type: String, enum: [...OCCUPANCIES] }],
    /** Sizes its shared rooms come in: Quad/Quint/Hexa. Empty means all. */
    allowedSharingWords: [{ type: String, enum: [...SHARING_WORDS] }],
    /** Package categories this option may be sold under. Empty means any. */
    allowedCategories: [{ type: Schema.Types.ObjectId, ref: "PackageCategory" }],

    allowedMealIds: [{ type: Schema.Types.ObjectId, ref: "Meal" }],
    allowedMealNoteIds: [{ type: Schema.Types.ObjectId, ref: "MealNote" }],

    sortOrder: { type: Number, default: 0 },
    active: { type: Boolean, default: true },
  },
  timestamps,
);

accommodationSchema.index({ locationId: 1, active: 1, sortOrder: 1 });

export const AccommodationModel = model("Accommodation", accommodationSchema);

// ------------------------------------------------------- meals & meal notes

function labelledSchema() {
  return new Schema(
    {
      label: { type: String, required: true, trim: true },
      sortOrder: { type: Number, default: 0 },
      active: { type: Boolean, default: true },
    },
    timestamps,
  );
}

export const MealModel = model("Meal", labelledSchema());
export const MealNoteModel = model("MealNote", labelledSchema());

/** Package-level classifications, e.g. "Maktab A Category". Admin-managed. */
export const PackageCategoryModel = model("PackageCategory", labelledSchema());

// ----------------------------------------------------------------- flights

/**
 * An air sector the agency can sell, with its fare. Outbound sectors fly to
 * Jeddah or Madinah; inbound ones fly home from either.
 */
const flightSchema = new Schema(
  {
    season: { type: String, required: true, trim: true },
    direction: { type: String, required: true, enum: [...FLIGHT_DIRECTIONS] },
    origin: { type: String, required: true, trim: true },
    destination: { type: String, required: true, trim: true },
    /** Round-trip only: city the return leg departs from. Empty = mirrors out. */
    returnFrom: { type: String, default: "", trim: true },
    airline: { type: String, default: "", trim: true },
    /** Fare per person for this sector. */
    price: { type: Number, required: true, min: 0 },
    sortOrder: { type: Number, default: 0 },
    active: { type: Boolean, default: true },
  },
  timestamps,
);

flightSchema.index({ season: 1, direction: 1, active: 1, sortOrder: 1 });

export const FlightModel = model("Flight", flightSchema);

// ----------------------------------------------------------- service items

const serviceItemSchema = new Schema(
  {
    category: { type: String, required: true, enum: [...SERVICE_CATEGORIES] },
    label: { type: String, required: true, trim: true },
    defaultSelected: { type: Boolean, default: true },
    sortOrder: { type: Number, default: 0 },
    active: { type: Boolean, default: true },
  },
  timestamps,
);

serviceItemSchema.index({ category: 1, active: 1, sortOrder: 1 });

export const ServiceItemModel = model("ServiceItem", serviceItemSchema);

// -------------------------------------------------------------- date block

const hijriDateSchema = new Schema(
  {
    month: { type: String, required: true, enum: [...HIJRI_MONTHS] },
    day: { type: Number, required: true, min: 1, max: 30 },
  },
  { _id: false },
);

const dateBlockSchema = new Schema(
  {
    season: { type: String, required: true, trim: true }, // Hijri year, "1447"
    startHijri: { type: hijriDateSchema, required: true },
    endHijri: { type: hijriDateSchema, required: true },
    phase: { type: String, required: true, enum: [...BLOCK_PHASES] },
    allowedLocationIds: [{ type: Schema.Types.ObjectId, ref: "Location" }],
    sortOrder: { type: Number, default: 0 },
    active: { type: Boolean, default: true },
  },
  timestamps,
);

dateBlockSchema.index({ season: 1, active: 1, sortOrder: 1 });

export const DateBlockModel = model("DateBlock", dateBlockSchema);

// -------------------------------------------------------------------- rate

/**
 * One document per (accommodation, block, season).
 *
 * Hajj accommodation is booked by the block at a negotiated figure, so the
 * rate belongs to a specific stay period - the same hotel costs a different
 * total in a different block, and nothing is multiplied by nights.
 *
 * The shape of `rates` depends on `model`, validated against the location's
 * pricing model in the service layer (Mongoose cannot express "one of these
 * three shapes" cleanly).
 */
const rateSchema = new Schema(
  {
    accommodationId: {
      type: Schema.Types.ObjectId,
      ref: "Accommodation",
      required: true,
    },
    blockId: { type: Schema.Types.ObjectId, ref: "DateBlock", required: true },
    season: { type: String, required: true, trim: true },
    model: { type: String, required: true, enum: [...PRICING_MODELS] },

    /** byOccupancy: { Quad, Triple, Double } */
    rates: { type: Schema.Types.Mixed, default: null },

    /** flat (Mina tents): one figure for the block */
    amount: { type: Number, default: null },

    /**
     * sharingOrSeparate (Aziziya). Sharing is a single figure - a shared room
     * may be four, five or six people, so it is not sold by occupancy.
     */
    sharing: { type: Number, default: null },
    separate: { type: Schema.Types.Mixed, default: null },

    updatedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
  },
  timestamps,
);

// Exactly one rate per accommodation per block per season.
rateSchema.index({ accommodationId: 1, blockId: 1, season: 1 }, { unique: true });

export const RateModel = model("Rate", rateSchema);

// ---------------------------------------------------------------- calendar

/**
 * The Umm al-Qura calendar the admin imports. With it, night counts come from
 * real Gregorian dates instead of assuming every Hijri month is 30 days.
 */
const calendarEntrySchema = new Schema(
  {
    hijriYear: { type: Number, required: true },
    month: { type: String, required: true, enum: [...HIJRI_MONTHS] },
    day: { type: Number, required: true, min: 1, max: 30 },
    gregorian: {
      type: String,
      required: true,
      match: /^\d{4}-\d{2}-\d{2}$/, // stored as a plain date, timezone-free
    },
    source: { type: String, default: "Umm al-Qura" },
  },
  timestamps,
);

calendarEntrySchema.index({ hijriYear: 1, month: 1, day: 1 }, { unique: true });

export const CalendarEntryModel = model("CalendarEntry", calendarEntrySchema);

// ------------------------------------------------------------------ export

export const OCCUPANCY_KEYS = [...OCCUPANCIES];
