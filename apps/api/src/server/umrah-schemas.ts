/**
 * Request validation for Umrah quotations.
 *
 * Like the Hajj schema, note what is NOT accepted: no totals, no price lines, no
 * nights. Those are worked out on the server from the rates the agent typed, so
 * a client cannot argue about the price. Everything is bounded, so one request
 * cannot carry an unreasonable amount of data. Business rules (dates, seating,
 * missing exchange rates...) are checked once, in `@junaidi/shared`, and come
 * back to the form as plain messages.
 */

import { UMRAH_QUOTATION_GROUPS, UMRAH_QUOTATION_SORTS, UMRAH_QUOTATION_STATUSES } from "@junaidi/db";
import {
  UMRAH_CHARGE_BASES,
  UMRAH_PRICE_DISPLAYS,
  UMRAH_PRICING_MODES,
  UMRAH_RATE_BASES,
  UMRAH_TRANSPORT_DISPLAYS,
} from "@junaidi/shared";
import { z } from "zod";

const objectId = z.string().regex(/^[a-f\d]{24}$/i, "Not a valid id.");

const MAX_MONEY = 1_000_000_000;
const money = z.number().min(0).max(MAX_MONEY);
const count = z.number().int().min(0).max(500);
const currencyCode = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{3}$/, "Use a three-letter currency code, e.g. SAR.");

const roomLineSchema = z.object({
  roomType: z.string().max(40),
  rooms: z.number().int().min(0).max(50),
  persons: count,
  rate: money,
});

const tierRatesSchema = z.object({
  Quad: money.nullable().default(null),
  Triple: money.nullable().default(null),
  Double: money.nullable().default(null),
});

const staySchema = z.object({
  city: z.string().max(60),
  hotelName: z.string().max(120),
  distance: z.string().max(60).default(""),
  checkIn: z.string().max(10),
  checkOut: z.string().max(10),
  meal: z.string().max(60).default(""),
  currencyCode,
  rateBasis: z.enum(UMRAH_RATE_BASES).default("room"),
  // Which of these a stay uses depends on the pricing mode; the service keeps
  // only the ones the mode needs.
  rooms: z.array(roomLineSchema).max(10).default([]),
  tierRates: tierRatesSchema.default({ Quad: null, Triple: null, Double: null }),
  withoutBedRate: money.default(0),
});

const legSchema = z.object({
  route: z.string().max(80),
  isCustomRoute: z.boolean().default(false),
  vehicle: z.string().max(80).default(""),
  cost: money,
  currencyCode,
});

const flightSchema = z.object({
  included: z.boolean().default(false),
  airline: z.string().max(60).default(""),
  outbound: z.string().max(120).default(""),
  inbound: z.string().max(120).default(""),
  adultFare: money.default(0),
  infantFare: money.default(0),
  currencyCode: currencyCode.default("PKR"),
});

const chargeSchema = z.object({
  label: z.string().max(80),
  amount: money,
  currencyCode,
  basis: z.enum(UMRAH_CHARGE_BASES).default("perPerson"),
});

const lineSettingSchema = z.object({
  key: z.enum(["main", "withoutBed", "infant", "Quad", "Triple", "Double"]),
  offered: z.boolean().optional(),
  discount: money.default(0),
  roundOff: z.number().min(-MAX_MONEY).max(MAX_MONEY).default(0),
  manualTotal: money.nullish().transform((value) => value ?? null),
});

const styledLine = z.object({
  text: z.string().max(300),
  color: z.string().max(20).optional(),
  bold: z.boolean().optional(),
});
const lines = z.array(z.union([z.string().max(300), styledLine])).max(50).default([]);

export const umrahQuotationSchema = z.object({
  guest: z.object({
    name: z.string().trim().min(1, "Guest name is required.").max(120),
    pax: z.number().int().min(1).max(500).default(1),
    withoutBedPax: count.default(0),
    infants: count.default(0),
  }),
  date: z.coerce.date(),
  validUntil: z.coerce.date().nullish(),
  packageTitle: z.string().max(200).default(""),

  pricingMode: z.enum(UMRAH_PRICING_MODES),
  priceDisplay: z.enum(UMRAH_PRICE_DISPLAYS).default("average"),
  transportDisplay: z.enum(UMRAH_TRANSPORT_DISPLAYS).default("included"),

  currency: z.object({
    code: currencyCode,
    symbol: z.string().trim().max(8).default(""),
    decimals: z.number().int().min(0).max(4),
  }),
  exchangeRates: z
    .array(z.object({ code: currencyCode, rate: z.number().positive().max(1_000_000) }))
    .max(10)
    .default([]),

  stays: z.array(staySchema).max(20),
  transportLegs: z.array(legSchema).max(30).default([]),
  flight: flightSchema.default({
    included: false,
    airline: "",
    outbound: "",
    inbound: "",
    adultFare: 0,
    infantFare: 0,
    currencyCode: "PKR",
  }),
  charges: z.array(chargeSchema).max(30).default([]),

  lineSettings: z.array(lineSettingSchema).max(10).default([]),
  discountNote: z.string().max(300).default(""),

  includes: lines,
  requirements: lines,
  terms: lines,
  remarks: z.string().max(2000).default(""),
});

export const umrahStatusSchema = z.object({
  status: z.enum(UMRAH_QUOTATION_STATUSES),
  /** Required when confirming; the unique booking number. */
  bookingRef: z.string().max(60).optional(),
  assignedStaffUserId: objectId.nullish(),
  assignedStaffName: z.string().max(120).optional(),
});

export const umrahListQuerySchema = z.object({
  year: z.string().max(4).optional(),
  status: z.string().max(20).optional(),
  search: z.string().max(100).optional(),
  createdBy: objectId.optional(),
  /** Shorthand for "createdBy = me". */
  mine: z.coerce.boolean().optional(),
  sort: z.enum(UMRAH_QUOTATION_SORTS).optional(),
  groupBy: z.enum(UMRAH_QUOTATION_GROUPS).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

// ---------------------------------------------------------------- settings

/** Blank, or an http(s) link with nothing that could break out of an attribute. */
const optionalUrl = z
  .string()
  .trim()
  .max(200)
  .refine((value) => value === "" || /^https?:\/\/[^\s"'<>]+$/i.test(value), "Enter a full link starting with https://");

/** Blank, or a phone number: digits with an optional + and common separators. */
const optionalPhone = z
  .string()
  .trim()
  .max(30)
  .refine((value) => value === "" || /^\+?[\d\s()-]{6,28}$/.test(value), "Enter digits only, e.g. +92 300 1234567");

const settingsLine = z.object({
  text: z.string().trim().min(1).max(300),
  color: z
    .string()
    .trim()
    .max(9)
    .refine((value) => value === "" || /^#[0-9a-fA-F]{3,8}$/.test(value), "Use a colour like #9f0b1f")
    .default(""),
  bold: z.boolean().default(false),
});

export const umrahSettingsSchema = z.object({
  company: z.object({
    name: z.string().trim().min(1, "The company name is required.").max(80),
    subheading: z.string().trim().max(80).default(""),
    tagline: z.string().trim().max(120).default(""),
    address: z.string().trim().max(200).default(""),
    contact: z.string().trim().max(200).default(""),
    social: z.object({
      facebook: optionalUrl.default(""),
      instagram: optionalUrl.default(""),
      youtube: optionalUrl.default(""),
      whatsapp: optionalPhone.default(""),
    }),
  }),
  defaults: z.object({
    includes: z.array(settingsLine).max(30).default([]),
    requirements: z.array(settingsLine).max(30).default([]),
    terms: z.array(settingsLine).max(30).default([]),
  }),
});
