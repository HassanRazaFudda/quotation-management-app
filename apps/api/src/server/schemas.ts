/**
 * Request validation.
 *
 * Note what is NOT accepted from the client: no rates, no subtotal, no
 * totals. Those are calculated server-side from the stored configuration, so
 * a client cannot argue about the price. Zod strips anything extra.
 */

import { QUOTATION_GROUPS, QUOTATION_SORTS } from "@junaidi/db";
import { AZIZIYA_ROOM_TYPES, OCCUPANCIES, SHARING_WORDS } from "@junaidi/shared";
import { z } from "zod";

export const loginSchema = z.object({
  email: z.string().email("Enter a valid email address."),
  password: z.string().min(1, "Enter your password."),
});

const objectId = z.string().regex(/^[a-f\d]{24}$/i, "Not a valid id.");

/** One room in a mixed stay: its own room choice (and accommodation) + headcount. */
const roomEntrySchema = z.object({
  accommodationId: objectId,
  roomType: z.enum(AZIZIYA_ROOM_TYPES).nullish(),
  occupancy: z.enum(OCCUPANCIES).nullish(),
  sharingWord: z.enum(SHARING_WORDS).nullish(),
  /** These people share a room without their own bed, at the no-bed rate. */
  withoutBed: z.boolean().nullish(),
  headcount: z.number().int().min(0).max(500),
});

export const staySchema = z.object({
  blockId: objectId,
  locationId: objectId,
  accommodationId: objectId,

  /** The room is chosen per stay, not once for the whole quotation. */
  roomType: z.enum(AZIZIYA_ROOM_TYPES).nullish(),
  occupancy: z.enum(OCCUPANCIES).nullish(),
  /** Print "Quad" instead of "Sharing". Wording only - never affects price. */
  sharingWord: z.enum(SHARING_WORDS).nullish(),

  mealId: objectId.nullish(),
  mealNoteId: objectId.nullish(),

  /** A mix of rooms for one stay; empty/absent means the whole party shares one. */
  rooms: z.array(roomEntrySchema).optional(),
});

export const flightSchema = z.object({
  included: z.boolean().default(false),
  /** Uses a two-way ticket; the separate sectors below are then ignored. */
  roundTrip: z.boolean().default(false),
  roundTripId: objectId.nullish(),
  outboundId: objectId.nullish(),
  returnRequired: z.boolean().default(true),
  inboundId: objectId.nullish(),
});

export const quotationSchema = z.object({
  season: z.string().min(3),
  guest: z.object({
    name: z.string().min(1, "Guest name is required."),
    pax: z.number().int().min(1).max(500).default(1),
  }),
  date: z.coerce.date(),
  validUntil: z.coerce.date().nullish(),
  packageTitle: z.string().default(""),
  packageCategory: z.string().default(""),
  withoutMina: z.boolean().default(false),
  qurbaniIncluded: z.boolean().default(true),
  stays: z.array(staySchema).min(1, "Add at least one stay."),
  flight: flightSchema.optional(),

  minaServiceIds: z.array(objectId).default([]),
  arafatServiceIds: z.array(objectId).default([]),
  includeIds: z.array(objectId).default([]),
  requirementIds: z.array(objectId).default([]),
  termIds: z.array(objectId).default([]),

  includesNote: z.string().default(""),
  remarks: z.string().default(""),

  discount: z.number().min(0).default(0),
  discountNote: z.string().default(""),
  manualTotal: z.number().min(0).nullish(),
  status: z.enum(["draft", "sent", "confirmed", "expired"]).default("draft"),
});

/**
 * A predefined package: a quotation shape without the customer or the money.
 * The itinerary and service fields are shared with a quotation; only the guest,
 * dates and pricing are dropped and a package name is added.
 */
/** One offered tier's controls: an optional typed-in price and a discount. */
const tierSettingSchema = z.object({
  manualTotal: z.number().min(0).nullish(),
  discount: z.number().min(0).default(0),
});

/**
 * A package's three-price block. Each tier is nullable: null (or absent) means
 * that tier is not offered, so a package can carry one, two or three prices.
 */
export const tierPricingSchema = z.object({
  enabled: z.boolean().default(false),
  Quad: tierSettingSchema.nullish(),
  Triple: tierSettingSchema.nullish(),
  Double: tierSettingSchema.nullish(),
});

export const packageSchema = z.object({
  id: objectId.nullish(),
  name: z.string().min(1, "A package needs a name."),
  season: z.string().min(3),
  packageTitle: z.string().default(""),
  packageCategory: z.string().default(""),
  withoutMina: z.boolean().default(false),
  qurbaniIncluded: z.boolean().default(true),
  minaAccommodationId: objectId.nullish(),
  stays: z.array(staySchema).min(1, "Add at least one stay."),
  flight: flightSchema.optional(),

  minaServiceIds: z.array(objectId).default([]),
  arafatServiceIds: z.array(objectId).default([]),
  includeIds: z.array(objectId).default([]),
  requirementIds: z.array(objectId).default([]),
  termIds: z.array(objectId).default([]),

  includesNote: z.string().default(""),
  remarks: z.string().default(""),

  tierPricing: tierPricingSchema.optional(),
  /** Per-room-type surcharges printed under the itinerary. */
  addOns: z
    .array(z.object({ label: z.string().default(""), amount: z.number().min(0).default(0) }))
    .default([]),
});

/**
 * Printing a package. The customer is optional - a package prints as a plain
 * brochure with no name, or as a named quote when details are entered.
 */
export const packagePrintSchema = z.object({
  guest: z
    .object({
      name: z.string().default(""),
      pax: z.number().int().min(1).max(500).default(1),
    })
    .optional(),
  validUntil: z.string().nullish(),
  /** A negotiated discount off every printed price. Internal - never printed. */
  discount: z.number().min(0).default(0),
});

/**
 * Saving a package as a customer quotation. Unlike printing, a quotation needs
 * a named guest, and a tiered package needs the chosen room tier.
 */
export const packageQuoteSchema = z.object({
  guest: z.object({
    name: z.string().min(1, "Guest name is required."),
    pax: z.number().int().min(1).max(500).default(1),
  }),
  validUntil: z.string().nullish(),
  discount: z.number().min(0).default(0),
  tier: z.enum(["Quad", "Triple", "Double"]).nullish(),
});

/** Live pricing needs less than a full save. */
export const calculateSchema = quotationSchema.pick({
  season: true,
  withoutMina: true,
  stays: true,
  flight: true,
  discount: true,
  manualTotal: true,
});

export const listQuerySchema = z.object({
  season: z.string().optional(),
  status: z.string().optional(),
  search: z.string().optional(),
  /** Narrow the shared list to one author. */
  createdBy: objectId.optional(),
  /** Shorthand for "createdBy = me". */
  mine: z.coerce.boolean().optional(),
  sort: z.enum(QUOTATION_SORTS).optional(),
  groupBy: z.enum(QUOTATION_GROUPS).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
