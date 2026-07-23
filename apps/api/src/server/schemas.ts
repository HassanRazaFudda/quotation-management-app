/**
 * Request validation.
 *
 * Note what is NOT accepted from the client: no rates, no subtotal, no
 * totals. Those are calculated server-side from the stored configuration, so
 * a client cannot argue about the price. Zod strips anything extra.
 */

import { AZIZIYA_ROOM_TYPES, OCCUPANCIES, SHARING_WORDS } from "@junaidi/shared";
import { z } from "zod";

export const loginSchema = z.object({
  email: z.string().email("Enter a valid email address."),
  password: z.string().min(1, "Enter your password."),
});

const objectId = z.string().regex(/^[a-f\d]{24}$/i, "Not a valid id.");

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
  mine: z.coerce.boolean().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
