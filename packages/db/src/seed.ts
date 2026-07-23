/**
 * Seed the database with the client's real Hajj structure.
 *
 * The date blocks, hotels and Mina tiers below are exactly the ones Junaidi
 * gave us. Rates are PLACEHOLDERS - the admin must set the real numbers in
 * Settings > Rates before any quotation goes to a customer.
 *
 * Safe to re-run: everything is upserted on a natural key, so seeding twice
 * does not create duplicates and does not overwrite rates an admin has edited.
 */

import { estimateNights, type HijriMonth, type ServiceCategory } from "@junaidi/shared";
import bcrypt from "bcryptjs";

import { connect, disconnect } from "./connection";
import {
  AccommodationModel,
  DateBlockModel,
  FlightModel,
  LocationModel,
  MealModel,
  MealNoteModel,
  PackageCategoryModel,
  RateModel,
  ServiceItemModel,
} from "./models/config";
import { UserModel } from "./models/user";
import {
  CALENDAR_1448,
  importCalendarMonths,
  type HijriMonthDefinition,
} from "./services/calendar";

/** Published calendars we already hold, by Hijri year. */
const CALENDARS_BY_SEASON: Record<string, HijriMonthDefinition[] | undefined> = {
  "1448": CALENDAR_1448,
};

/**
 * Hajj 1448 (Arafat falls on 15 May 2027) - the next season. 1447 has already
 * passed, so quotations being written now are for 1448.
 */
export const DEFAULT_SEASON = "1448";

type BlockSeed = {
  start: [HijriMonth, number];
  end: [HijriMonth, number];
  phase: "pre" | "hajj" | "post";
  locations: string[]; // location names
};

/** Straight from the client's list. */
const BLOCKS: BlockSeed[] = [
  { start: ["Zilqad", 20], end: ["Zilqad", 25], phase: "pre", locations: ["Madinah", "Makkah"] },
  { start: ["Zilqad", 25], end: ["Zilhaj", 1], phase: "pre", locations: ["Madinah", "Makkah"] },
  { start: ["Zilhaj", 1], end: ["Zilhaj", 4], phase: "pre", locations: ["Aziziya", "Makkah", "Madinah"] },
  { start: ["Zilhaj", 4], end: ["Zilhaj", 6], phase: "pre", locations: ["Makkah", "Madinah"] },
  { start: ["Zilhaj", 4], end: ["Zilhaj", 7], phase: "pre", locations: ["Aziziya"] },
  { start: ["Zilhaj", 6], end: ["Zilhaj", 7], phase: "pre", locations: ["Aziziya"] },
  { start: ["Zilhaj", 6], end: ["Zilhaj", 8], phase: "pre", locations: ["Makkah"] },

  // Via Aziziya (ends 07) -> 5 nights. Via Makkah (ends 08) -> 4 nights.
  { start: ["Zilhaj", 7], end: ["Zilhaj", 12], phase: "hajj", locations: ["Mina"] },
  { start: ["Zilhaj", 8], end: ["Zilhaj", 12], phase: "hajj", locations: ["Mina"] },

  { start: ["Zilhaj", 12], end: ["Zilhaj", 14], phase: "post", locations: ["Aziziya"] },
  { start: ["Zilhaj", 12], end: ["Zilhaj", 17], phase: "post", locations: ["Aziziya"] },
  { start: ["Zilhaj", 14], end: ["Zilhaj", 17], phase: "post", locations: ["Makkah", "Madinah"] },
  { start: ["Zilhaj", 17], end: ["Zilhaj", 20], phase: "post", locations: ["Makkah", "Madinah"] },
  { start: ["Zilhaj", 20], end: ["Zilhaj", 25], phase: "post", locations: ["Madinah"] },
];

const LOCATIONS = [
  { name: "Madinah", type: "madinah", pricingModel: "byOccupancy", sortOrder: 1 },
  { name: "Makkah", type: "makkah", pricingModel: "byOccupancy", sortOrder: 2 },
  { name: "Aziziya", type: "aziziya", pricingModel: "sharingOrSeparate", sortOrder: 3 },
  { name: "Mina", type: "mina", pricingModel: "flat", sortOrder: 4 },
] as const;

const MEALS = ["Half Board", "Full Board", "3 Time", "Breakfast Only", "Room Only"];
const MEAL_NOTES = ["Asian Buffet", "Pakistani Meal", "Meal by Muallim"];

// Package-level classifications the customer sees on the quotation. Admin can
// add, rename or remove these; these are just a starting set.
const PACKAGE_CATEGORIES = [
  "Maktab A Category",
  "Maktab B Category",
  "Maktab C Category",
  "Maktab D Category",
];

const ACCOMMODATIONS = [
  { location: "Madinah", name: "Sofitel Madinah Hotel", meals: ["Half Board", "Full Board"], notes: ["Asian Buffet"] },
  { location: "Madinah", name: "Maden Madinah Hotel", meals: ["Half Board", "Full Board"], notes: ["Asian Buffet"] },
  { location: "Makkah", name: "Swiss Al Maqam / Movenpick Hajar Tower", meals: ["Half Board", "Full Board"], notes: ["Asian Buffet"] },
  { location: "Makkah", name: "Swiss Al Maqam", meals: ["Half Board"], notes: ["Asian Buffet"] },
  { location: "Makkah", name: "Movenpick Hajar Tower", meals: ["Half Board"], notes: ["Asian Buffet"] },
  { location: "Aziziya", name: "Aziziya Hotel", meals: ["3 Time"], notes: ["Pakistani Meal"] },
  { location: "Mina", name: "Mina Standard", tier: "standard", beds: 16, meals: ["3 Time"], notes: ["Meal by Muallim"] },
  { location: "Mina", name: "Mina Premium", tier: "premium", beds: 12, meals: ["3 Time"], notes: ["Meal by Muallim"] },
  { location: "Mina", name: "Mina Deluxe", tier: "deluxe", beds: 8, meals: ["3 Time"], notes: ["Meal by Muallim"] },
  // No tent, but still a sold line: Muallim, transport and Arafat are charged.
  // The admin sets its rate and which categories may be sold it.
  { location: "Mina", name: "Without Mina", withoutMina: true, meals: ["3 Time"], notes: [] },
] as const;

/**
 * PLACEHOLDER rate seeds.
 *
 * Rates are per (accommodation, block) - a hotel is booked for a whole block at
 * a negotiated figure. There is no real per-night price to seed from, so these
 * starting figures are derived from an indicative nightly cost purely so the
 * app has usable numbers on day one. **The admin must replace them with the
 * real negotiated block rates before quoting anyone.**
 */
const RATE_BASIS: Record<string, { model: string; perNight: Record<string, unknown> }> = {
  "Sofitel Madinah Hotel": { model: "byOccupancy", perNight: { Quad: 22000, Triple: 26000, Double: 32000 } },
  "Maden Madinah Hotel": { model: "byOccupancy", perNight: { Quad: 15000, Triple: 18000, Double: 23000 } },
  "Swiss Al Maqam / Movenpick Hajar Tower": { model: "byOccupancy", perNight: { Quad: 30000, Triple: 35000, Double: 44000 } },
  "Swiss Al Maqam": { model: "byOccupancy", perNight: { Quad: 29000, Triple: 34000, Double: 43000 } },
  "Movenpick Hajar Tower": { model: "byOccupancy", perNight: { Quad: 31000, Triple: 36000, Double: 45000 } },
  "Aziziya Hotel": {
    model: "sharingOrSeparate",
    perNight: {
      // Sharing is one figure - a shared room may be four, five or six.
      sharing: 8000,
      separate: { Quad: 12000, Triple: 14000, Double: 18000 },
    },
  },
  // Mina tents are already a whole-period figure, so nights do not scale them.
  "Mina Standard": { model: "flat", perNight: { fixed: 145000 } },
  "Mina Premium": { model: "flat", perNight: { fixed: 195000 } },
  "Mina Deluxe": { model: "flat", perNight: { fixed: 260000 } },
  // No tent, but the Muallim, transport and Arafat are still charged.
  "Without Mina": { model: "flat", perNight: { fixed: 40000 } },
};

/** Turn the indicative basis into a block total for a given night count. */
function seedRateFor(basis: { model: string; perNight: Record<string, unknown> }, nights: number) {
  if (basis.model === "flat") {
    return {
      model: "flat",
      amount: basis.perNight.fixed as number,
      rates: null, sharing: null, separate: null,
    };
  }

  if (basis.model === "sharingOrSeparate") {
    const sharing = basis.perNight.sharing as number;
    const separate = basis.perNight.separate as Record<string, number>;
    return {
      model: "sharingOrSeparate",
      sharing: sharing * nights,
      separate: Object.fromEntries(
        Object.entries(separate).map(([occ, v]) => [occ, v * nights]),
      ),
      rates: null, amount: null,
    };
  }

  const src = basis.perNight as Record<string, number>;
  return {
    model: "byOccupancy",
    rates: Object.fromEntries(Object.entries(src).map(([occ, v]) => [occ, v * nights])),
    amount: null, sharing: null, separate: null,
  };
}

/**
 * Air sectors the agency sells. Outbound flies into Jeddah (Makkah first) or
 * Madinah; inbound flies home from either, so a guest can arrive in Madinah and
 * leave from Jeddah. PLACEHOLDER fares - admin sets the real ones.
 */
const FLIGHTS = [
  // Two-way tickets: one fare covers both legs (usually cheaper than two one-ways).
  { direction: "roundtrip", origin: "Karachi", destination: "Jeddah", returnFrom: "", airline: "PIA", price: 300000 },
  { direction: "roundtrip", origin: "Karachi", destination: "Madinah", returnFrom: "Jeddah", airline: "Saudia", price: 320000 },
  { direction: "roundtrip", origin: "Lahore", destination: "Jeddah", returnFrom: "", airline: "PIA", price: 312000 },

  { direction: "outbound", origin: "Karachi", destination: "Jeddah", airline: "PIA", price: 165000 },
  { direction: "outbound", origin: "Karachi", destination: "Madinah", airline: "Saudia", price: 178000 },
  { direction: "outbound", origin: "Lahore", destination: "Jeddah", airline: "PIA", price: 172000 },
  { direction: "outbound", origin: "Islamabad", destination: "Jeddah", airline: "Saudia", price: 175000 },
  { direction: "inbound", origin: "Jeddah", destination: "Karachi", airline: "PIA", price: 158000 },
  { direction: "inbound", origin: "Madinah", destination: "Karachi", airline: "Saudia", price: 169000 },
  { direction: "inbound", origin: "Jeddah", destination: "Lahore", airline: "PIA", price: 165000 },
  { direction: "inbound", origin: "Jeddah", destination: "Islamabad", airline: "Saudia", price: 168000 },
] as const;

const SERVICES: Array<{ category: ServiceCategory; items: string[] }> = [
  {
    category: "minaServices",
    items: [
      "Carpeted and Gypsum-covered Tents (16 Hajis sharing each camp).",
      "Mic & Speaker in each tent for religious guidance and Mahafil.",
    ],
  },
  { category: "arafatServices", items: ["Air-cooled tents at Arafat.", "Cold beverages throughout the day."] },
  {
    category: "includes",
    items: [
      "Visa charges & Meals as per itinerary.",
      "Presence of Experienced Staff.",
      "24 hrs Hot/Cold Beverages (Hajj days).",
      "Transportation by Buses.",
    ],
  },
  {
    category: "requirements",
    items: [
      "Original/scan passport (1 year valid).",
      "NIC copy (front and back).",
      "04 Pictures (blue background).",
      "Polio vaccine (if required).",
      "Nominee valid CNIC & contact.",
      "Blood Group of Applicant.",
    ],
  },
  {
    category: "terms",
    items: [
      "Check-in 16:00, Check-out 12:00.",
      "Bookings are non-refundable.",
      "VAT and Municipal Tax included.",
      "Haji pays any extra MOH taxes.",
    ],
  },
];

export interface SeedResult {
  season: string;
  locations: number;
  accommodations: number;
  blocks: number;
  meals: number;
  mealNotes: number;
  services: number;
  rates: number;
  calendarDays: number;
  adminEmail: string | null;
}

export async function seed(season = DEFAULT_SEASON): Promise<SeedResult> {
  // --- lookups ---------------------------------------------------------
  const locationIds = new Map<string, string>();
  for (const location of LOCATIONS) {
    const doc = await LocationModel.findOneAndUpdate(
      { name: location.name },
      { $set: { ...location, active: true } },
      { upsert: true, returnDocument: "after" },
    );
    locationIds.set(location.name, String(doc._id));
  }

  const mealIds = new Map<string, string>();
  for (const [index, label] of MEALS.entries()) {
    const doc = await MealModel.findOneAndUpdate(
      { label },
      { $set: { label, sortOrder: index, active: true } },
      { upsert: true, returnDocument: "after" },
    );
    mealIds.set(label, String(doc._id));
  }

  const noteIds = new Map<string, string>();
  for (const [index, label] of MEAL_NOTES.entries()) {
    const doc = await MealNoteModel.findOneAndUpdate(
      { label },
      { $set: { label, sortOrder: index, active: true } },
      { upsert: true, returnDocument: "after" },
    );
    noteIds.set(label, String(doc._id));
  }

  for (const [index, label] of PACKAGE_CATEGORIES.entries()) {
    await PackageCategoryModel.findOneAndUpdate(
      { label },
      { $set: { label, sortOrder: index, active: true } },
      { upsert: true, returnDocument: "after" },
    );
  }

  // --- accommodations --------------------------------------------------
  const accommodationIds = new Map<string, string>();
  for (const [index, item] of ACCOMMODATIONS.entries()) {
    const doc = await AccommodationModel.findOneAndUpdate(
      { name: item.name },
      {
        $set: {
          name: item.name,
          locationId: locationIds.get(item.location),
          minaTier: "tier" in item ? item.tier : null,
          bedsPerTent: "beds" in item ? item.beds : null,
          withoutMina: "withoutMina" in item ? item.withoutMina : false,
          allowedMealIds: item.meals.map((m) => mealIds.get(m)),
          allowedMealNoteIds: item.notes.map((n) => noteIds.get(n)),
          sortOrder: index,
          active: true,
        },
      },
      { upsert: true, returnDocument: "after" },
    );
    accommodationIds.set(item.name, String(doc._id));
  }

  // --- date blocks -----------------------------------------------------
  for (const [index, block] of BLOCKS.entries()) {
    const startHijri = { month: block.start[0], day: block.start[1] };
    const endHijri = { month: block.end[0], day: block.end[1] };
    await DateBlockModel.findOneAndUpdate(
      {
        season,
        "startHijri.month": startHijri.month,
        "startHijri.day": startHijri.day,
        "endHijri.month": endHijri.month,
        "endHijri.day": endHijri.day,
      },
      {
        $set: {
          season,
          startHijri,
          endHijri,
          phase: block.phase,
          allowedLocationIds: block.locations.map((name) => locationIds.get(name)),
          sortOrder: index,
          active: true,
        },
      },
      { upsert: true, returnDocument: "after" },
    );
  }

  // --- services --------------------------------------------------------
  let serviceCount = 0;
  for (const group of SERVICES) {
    for (const [index, label] of group.items.entries()) {
      await ServiceItemModel.findOneAndUpdate(
        { category: group.category, label },
        {
          $set: {
            category: group.category,
            label,
            defaultSelected: true,
            sortOrder: index,
            active: true,
          },
        },
        { upsert: true, returnDocument: "after" },
      );
      serviceCount += 1;
    }
  }

  // --- rates -----------------------------------------------------------
  // One rate per (accommodation, block): a hotel is booked for a whole block.
  // `$setOnInsert` so re-seeding never overwrites real rates an admin typed.
  const savedBlocks = await DateBlockModel.find({ season }).lean();
  const savedAccommodations = await AccommodationModel.find().lean();

  let rateCount = 0;
  for (const accommodation of savedAccommodations) {
    const basis = RATE_BASIS[accommodation.name];
    if (!basis) continue;

    // Only the blocks this accommodation's location is actually allowed in.
    const usable = savedBlocks.filter((block) =>
      (block.allowedLocationIds ?? []).some(
        (id) => String(id) === String(accommodation.locationId),
      ),
    );

    for (const block of usable) {
      const nights = estimateNights(
        { month: block.startHijri.month as HijriMonth, day: block.startHijri.day },
        { month: block.endHijri.month as HijriMonth, day: block.endHijri.day },
      );
      await RateModel.updateOne(
        { accommodationId: accommodation._id, blockId: block._id, season },
        {
          $setOnInsert: {
            accommodationId: accommodation._id,
            blockId: block._id,
            season,
            ...seedRateFor(basis, nights),
          },
        },
        { upsert: true },
      );
      rateCount += 1;
    }
  }

  // --- flights ---------------------------------------------------------
  // `$setOnInsert` on the fare so re-seeding never overwrites a real price.
  for (const [index, flight] of FLIGHTS.entries()) {
    await FlightModel.updateOne(
      { season, direction: flight.direction, origin: flight.origin, destination: flight.destination },
      {
        $set: {
          airline: flight.airline,
          returnFrom: "returnFrom" in flight ? flight.returnFrom : "",
          sortOrder: index,
          active: true,
        },
        $setOnInsert: {
          season,
          direction: flight.direction,
          origin: flight.origin,
          destination: flight.destination,
          price: flight.price,
        },
      },
      { upsert: true },
    );
  }

  // --- calendar --------------------------------------------------------
  // Without this, night counts fall back to assuming 30-day months, which is
  // wrong for 1448 (Zilqad is 29 days).
  const calendarMonths = CALENDARS_BY_SEASON[season];
  let calendarDays = 0;
  if (calendarMonths) {
    const result = await importCalendarMonths(calendarMonths);
    calendarDays = result.days;
    if (result.problems.length > 0) {
      console.warn("Calendar problems:", result.problems);
    }
  }

  // --- admin user ------------------------------------------------------
  const adminEmail = process.env.SEED_ADMIN_EMAIL ?? "admin@junaidi.app";
  const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? "hajj@#0987";
  let seededAdmin: string | null = null;

  if (adminPassword) {
    const existing = await UserModel.findOne({ email: adminEmail });
    if (!existing) {
      await UserModel.create({
        email: adminEmail,
        name: "Administrator",
        passwordHash: await bcrypt.hash(adminPassword, 12),
        role: "admin",
        active: true,
      });
      seededAdmin = adminEmail;
    }
  }

  return {
    season,
    locations: LOCATIONS.length,
    accommodations: ACCOMMODATIONS.length,
    blocks: BLOCKS.length,
    meals: MEALS.length,
    mealNotes: MEAL_NOTES.length,
    services: serviceCount,
    rates: rateCount,
    calendarDays,
    adminEmail: seededAdmin,
  };
}

// Run directly: pnpm --filter @junaidi/db seed
if (process.argv[1]?.includes("seed")) {
  await connect();
  const result = await seed();
  console.log("Seeded:", result);
  if (!result.adminEmail) {
    console.log(
      "No admin created. Set SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD to create one.",
    );
  }
  console.log("Rates are PLACEHOLDERS - set the real ones before going live.");
  await disconnect();
}
