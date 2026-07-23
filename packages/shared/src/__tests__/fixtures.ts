/**
 * A small but realistic configuration, mirroring what the admin would set up
 * for the 1447 season. Used by every test file.
 */

import type {
  Accommodation,
  CalendarEntry,
  DateBlock,
  Location,
  Meal,
  MealNote,
  Rate,
} from "../types";

export const SEASON = "1447";

export const locations: Location[] = [
  { id: "loc-madinah", name: "Madinah", type: "madinah", pricingModel: "byOccupancy", sortOrder: 1, active: true },
  { id: "loc-makkah", name: "Makkah", type: "makkah", pricingModel: "byOccupancy", sortOrder: 2, active: true },
  { id: "loc-aziziya", name: "Aziziya", type: "aziziya", pricingModel: "sharingOrSeparate", sortOrder: 3, active: true },
  { id: "loc-mina", name: "Mina", type: "mina", pricingModel: "flat", sortOrder: 4, active: true },
];

export const meals: Meal[] = [
  { id: "meal-half", label: "Half Board", sortOrder: 1, active: true },
  { id: "meal-3time", label: "3 Time", sortOrder: 2, active: true },
];

export const mealNotes: MealNote[] = [
  { id: "note-asian", label: "Asian Buffet", sortOrder: 1, active: true },
  { id: "note-pak", label: "Pakistani Meal", sortOrder: 2, active: true },
  { id: "note-muallim", label: "Meal by Muallim", sortOrder: 3, active: true },
];

export const accommodations: Accommodation[] = [
  {
    id: "acc-sofitel", locationId: "loc-madinah", name: "Sofitel Madinah Hotel",
    allowedMealIds: ["meal-half"], allowedMealNoteIds: [], sortOrder: 1, active: true,
  },
  {
    id: "acc-swiss", locationId: "loc-makkah", name: "Swiss Al Maqam / Movenpick Hajar Tower",
    allowedMealIds: ["meal-half"], allowedMealNoteIds: ["note-asian"], sortOrder: 1, active: true,
  },
  {
    id: "acc-aziziya", locationId: "loc-aziziya", name: "Aziziya Hotel",
    allowedMealIds: ["meal-3time"], allowedMealNoteIds: ["note-pak"], sortOrder: 1, active: true,
  },
  {
    id: "acc-mina-std", locationId: "loc-mina", name: "Mina Standard",
    minaTier: "standard", bedsPerTent: 16,
    allowedMealIds: ["meal-3time"], allowedMealNoteIds: ["note-muallim"], sortOrder: 1, active: true,
  },
  {
    id: "acc-mina-dlx", locationId: "loc-mina", name: "Mina Deluxe",
    minaTier: "deluxe", bedsPerTent: 8,
    // Deluxe is only sold under the A category.
    allowedCategories: ["cat-a"],
    allowedMealIds: ["meal-3time"], allowedMealNoteIds: ["note-muallim"], sortOrder: 3, active: true,
  },
  {
    // Books no tent, but still charges the Muallim and transport.
    id: "acc-no-mina", locationId: "loc-mina", name: "Without Mina",
    withoutMina: true, allowedCategories: ["cat-c", "cat-d"],
    allowedMealIds: [], allowedMealNoteIds: [], sortOrder: 4, active: true,
  },
  {
    // A small hotel with no double rooms at all.
    id: "acc-markazia", locationId: "loc-makkah", name: "3 Star Markazia",
    allowedOccupancies: ["Quad", "Triple"],
    allowedMealIds: ["meal-half"], allowedMealNoteIds: [], sortOrder: 2, active: true,
  },
];

/**
 * Blocks matching the client's real structure, including both Hajj variants:
 * a stay ending 07 Zilhaj leads to a 5-night Hajj, ending 08 Zilhaj to 4.
 */
export const blocks: DateBlock[] = [
  block("blk-pre-madinah", { month: "Zilqad", day: 20 }, { month: "Zilqad", day: 25 }, "pre", ["loc-madinah"]),
  block("blk-pre-makkah", { month: "Zilqad", day: 25 }, { month: "Zilhaj", day: 1 }, "pre", ["loc-makkah"]),
  block("blk-aziziya-1", { month: "Zilhaj", day: 1 }, { month: "Zilhaj", day: 4 }, "pre", ["loc-aziziya"]),
  block("blk-aziziya-2", { month: "Zilhaj", day: 4 }, { month: "Zilhaj", day: 7 }, "pre", ["loc-aziziya"]),
  block("blk-makkah-8", { month: "Zilhaj", day: 6 }, { month: "Zilhaj", day: 8 }, "pre", ["loc-makkah"]),
  block("blk-hajj-5n", { month: "Zilhaj", day: 7 }, { month: "Zilhaj", day: 12 }, "hajj", ["loc-mina"]),
  block("blk-hajj-4n", { month: "Zilhaj", day: 8 }, { month: "Zilhaj", day: 12 }, "hajj", ["loc-mina"]),
  block("blk-post-aziziya", { month: "Zilhaj", day: 12 }, { month: "Zilhaj", day: 17 }, "post", ["loc-aziziya"]),
  block("blk-post-madinah", { month: "Zilhaj", day: 17 }, { month: "Zilhaj", day: 20 }, "post", ["loc-madinah"]),
];

function block(
  id: string,
  startHijri: DateBlock["startHijri"],
  endHijri: DateBlock["endHijri"],
  phase: DateBlock["phase"],
  allowedLocationIds: string[],
): DateBlock {
  return { id, season: SEASON, startHijri, endHijri, phase, allowedLocationIds, sortOrder: 0, active: true };
}

/**
 * Rates are per (accommodation, block). Note Aziziya appears in two blocks at
 * deliberately different prices - proving a block rate is a negotiated figure,
 * not a nightly rate scaled up.
 */
export const rates: Rate[] = [
  {
    model: "byOccupancy", accommodationId: "acc-sofitel", blockId: "blk-pre-madinah", season: SEASON,
    rates: { Quad: 110_000, Triple: 130_000, Double: 160_000 },
  },
  {
    model: "byOccupancy", accommodationId: "acc-sofitel", blockId: "blk-post-madinah", season: SEASON,
    rates: { Quad: 62_000, Triple: 74_000, Double: 92_000 },
  },
  {
    model: "byOccupancy", accommodationId: "acc-swiss", blockId: "blk-pre-makkah", season: SEASON,
    rates: { Quad: 150_000, Triple: 175_000, Double: 220_000 },
  },
  {
    model: "byOccupancy", accommodationId: "acc-swiss", blockId: "blk-makkah-8", season: SEASON,
    rates: { Quad: 58_000, Triple: 68_000, Double: 86_000 },
  },
  {
    model: "sharingOrSeparate", accommodationId: "acc-aziziya", blockId: "blk-aziziya-1", season: SEASON,
    sharing: 24_000, // one figure: a shared room is not sold by occupancy
    separate: { Quad: 36_000, Triple: 42_000, Double: 54_000 },
  },
  {
    model: "sharingOrSeparate", accommodationId: "acc-aziziya", blockId: "blk-aziziya-2", season: SEASON,
    sharing: 22_000,
    separate: { Quad: 34_000, Triple: 40_000, Double: 51_000 },
  },
  {
    model: "flat", accommodationId: "acc-mina-std", blockId: "blk-hajj-5n", season: SEASON,
    amount: 145_000,
  },
  {
    model: "flat", accommodationId: "acc-mina-std", blockId: "blk-hajj-4n", season: SEASON,
    amount: 132_000,
  },
  {
    model: "flat", accommodationId: "acc-mina-dlx", blockId: "blk-hajj-5n", season: SEASON,
    amount: 260_000,
  },
  {
    model: "flat", accommodationId: "acc-no-mina", blockId: "blk-hajj-5n", season: SEASON,
    amount: 40_000,
  },
];

/**
 * A deliberately irregular calendar slice: Zilqad is given 29 days so the
 * tests prove the imported calendar wins over the 30-day estimate.
 */
export const calendar: CalendarEntry[] = [
  { hijriYear: 1447, month: "Zilqad", day: 20, gregorian: "2026-05-06" },
  { hijriYear: 1447, month: "Zilqad", day: 25, gregorian: "2026-05-11" },
  { hijriYear: 1447, month: "Zilhaj", day: 1, gregorian: "2026-05-16" }, // 29-day Zilqad
  { hijriYear: 1447, month: "Zilhaj", day: 4, gregorian: "2026-05-19" },
  { hijriYear: 1447, month: "Zilhaj", day: 6, gregorian: "2026-05-21" },
  { hijriYear: 1447, month: "Zilhaj", day: 7, gregorian: "2026-05-22" },
  { hijriYear: 1447, month: "Zilhaj", day: 8, gregorian: "2026-05-23" },
  { hijriYear: 1447, month: "Zilhaj", day: 12, gregorian: "2026-05-27" },
  { hijriYear: 1447, month: "Zilhaj", day: 17, gregorian: "2026-06-01" },
  { hijriYear: 1447, month: "Zilhaj", day: 20, gregorian: "2026-06-04" },
];
