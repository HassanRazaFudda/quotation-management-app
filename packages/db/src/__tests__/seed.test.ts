import {
  calculateTotals,
  makePricingContext,
  makeValidationContext,
  priceStays,
  resolveBlocks,
  suggestHajjBlock,
  validateItinerary,
  type StayInput,
} from "@junaidi/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  AccommodationModel,
  DateBlockModel,
  LocationModel,
  RateModel,
} from "../models/config";
import { DEFAULT_SEASON, seed } from "../seed";
import { findConfigProblems, getConfigBundle } from "../services/config";
import { connectTestDb, dropTestDb } from "./setup";

beforeAll(async () => {
  await connectTestDb("seed");
  await seed();
}, 60_000);

afterAll(async () => {
  await dropTestDb();
});

describe("seeding the client's structure", () => {
  it("creates the four locations with the right pricing models", async () => {
    const locations = await LocationModel.find().lean();
    expect(locations).toHaveLength(4);

    const byName = new Map(locations.map((l) => [l.name, l]));
    expect(byName.get("Makkah")?.pricingModel).toBe("byOccupancy");
    expect(byName.get("Aziziya")?.pricingModel).toBe("sharingOrSeparate");
    expect(byName.get("Mina")?.pricingModel).toBe("flat");
  });

  it("creates the three Mina tiers with their bed counts", async () => {
    const mina = await AccommodationModel.find({ minaTier: { $ne: null } }).lean();
    const beds = Object.fromEntries(mina.map((m) => [m.minaTier, m.bedsPerTent]));
    expect(beds).toEqual({ standard: 16, premium: 12, deluxe: 8 });
  });

  it("creates every date block from the client's list", async () => {
    const blocks = await DateBlockModel.find({ season: DEFAULT_SEASON }).lean();
    expect(blocks).toHaveLength(14);

    const hajj = blocks.filter((b) => b.phase === "hajj");
    expect(hajj).toHaveLength(2); // the 07-12 and 08-12 variants
  });

  it("is safe to run twice", async () => {
    await seed();
    expect(await LocationModel.countDocuments()).toBe(4);
    expect(await DateBlockModel.countDocuments({ season: DEFAULT_SEASON })).toBe(14);
  }, 60_000);

  it("does not overwrite a rate the admin has edited", async () => {
    const sofitel = await AccommodationModel.findOne({ name: "Sofitel Madinah Hotel" });
    const original = await RateModel.findOne({
      accommodationId: sofitel!._id,
      season: DEFAULT_SEASON,
    }).lean();
    const query = { _id: original!._id };

    await RateModel.updateOne(query, {
      $set: { rates: { Quad: 99_999, Triple: 99_999, Double: 99_999 } },
    });

    await seed();

    const rate = await RateModel.findOne(query).lean();
    expect((rate!.rates as Record<string, number>).Quad).toBe(99_999);

    // Put it back: later tests price real itineraries against these rates.
    await RateModel.updateOne(query, { $set: { rates: original!.rates } });
  }, 60_000);

  it("creates a rate for every block a hotel can be used in", async () => {
    const sofitel = await AccommodationModel.findOne({ name: "Sofitel Madinah Hotel" });
    const rates = await RateModel.find({
      accommodationId: sofitel!._id,
      season: DEFAULT_SEASON,
    }).lean();

    // Madinah is allowed in several blocks, so there must be several rates,
    // each tied to a block.
    expect(rates.length).toBeGreaterThan(1);
    expect(new Set(rates.map((r) => String(r.blockId))).size).toBe(rates.length);
  });
});

describe("the config bundle", () => {
  it("returns everything the builder needs in one call", async () => {
    const bundle = await getConfigBundle(DEFAULT_SEASON);

    expect(bundle.locations.length).toBe(4);
    expect(bundle.accommodations.length).toBe(10);
    expect(bundle.blocks.length).toBe(14);
    expect(bundle.meals.length).toBe(5);
    expect(bundle.mealNotes.length).toBe(3);
    expect(bundle.services.length).toBeGreaterThan(15);

    // Rates are per (hotel, block), so there are many more than there are
    // hotels, and every one names its block.
    expect(bundle.rates.length).toBeGreaterThan(bundle.accommodations.length);
    expect(bundle.rates.every((r) => Boolean(r.blockId))).toBe(true);
  });

  it("hands back plain string ids, not ObjectIds", async () => {
    const bundle = await getConfigBundle(DEFAULT_SEASON);
    expect(typeof bundle.locations[0]!.id).toBe("string");
    expect(typeof bundle.blocks[0]!.allowedLocationIds[0]).toBe("string");
    expect(JSON.parse(JSON.stringify(bundle))).toEqual(bundle); // serialisable
  });

  it("warns the admin when a season has no calendar imported", async () => {
    // A future season nobody has uploaded a calendar for yet.
    const bundle = await getConfigBundle("1460");
    expect(findConfigProblems(bundle).map((p) => p.kind)).toContain("NO_CALENDAR");
  });

  it("reports nothing for the seeded season — it is internally consistent", async () => {
    const bundle = await getConfigBundle(DEFAULT_SEASON);
    expect(findConfigProblems(bundle)).toEqual([]);
  });
});

/**
 * The point of the whole exercise: seeded config feeds the shared rules and
 * prices a real quotation end to end.
 */
describe("seeded config drives the domain rules", () => {
  it("prices a full itinerary and enforces the Hajj rule", async () => {
    const bundle = await getConfigBundle(DEFAULT_SEASON);
    const blocks = resolveBlocks(bundle.blocks, bundle.calendar);

    const find = (start: string, end: string) =>
      blocks.find((b) => b.label === `${start} - ${end}`)!;
    const accommodation = (name: string) =>
      bundle.accommodations.find((a) => a.name === name)!;

    const aziziya = accommodation("Aziziya Hotel");
    const mina = accommodation("Mina Deluxe");
    const madinah = accommodation("Sofitel Madinah Hotel");

    const stays: StayInput[] = [
      {
        blockId: find("20 Zilqad", "25 Zilqad").id,
        locationId: madinah.locationId,
        accommodationId: madinah.id,
        roomType: "sharing",
        occupancy: "Quad",
        mealId: madinah.allowedMealIds[0],
      },
      {
        blockId: find("04 Zilhaj", "07 Zilhaj").id,
        locationId: aziziya.locationId,
        accommodationId: aziziya.id,
        roomType: "sharing",
        mealId: aziziya.allowedMealIds[0],
      },
      {
        blockId: find("07 Zilhaj", "12 Zilhaj").id,
        locationId: mina.locationId,
        accommodationId: mina.id,
        mealId: mina.allowedMealIds[0],
      },
    ];

    const validation = makeValidationContext({
      blocks, locations: bundle.locations, accommodations: bundle.accommodations,
      meals: bundle.meals, mealNotes: bundle.mealNotes,
    });

    // The Aziziya stay ends on 07 Zilhaj, so the 5-night Hajj block follows.
    expect(suggestHajjBlock(stays, validation)?.label).toBe("07 Zilhaj - 12 Zilhaj");

    const pricing = makePricingContext({
      blocks, accommodations: bundle.accommodations,
      locations: bundle.locations, rates: bundle.rates,
    });

    const priced = priceStays(stays, pricing);
    const totals = calculateTotals({ stays: priced, discount: 30_000 });

    // Derived from the seeded rates rather than hard-coded, so changing the
    // placeholder numbers cannot break this test. What is under test is that
    // each pricing model is applied, and that a block rate is used as-is.
    const rateFor = (accommodationId: string, blockId: string) =>
      bundle.rates.find(
        (r) => r.accommodationId === accommodationId && r.blockId === blockId,
      )!;

    const madinahRate = rateFor(madinah.id, stays[0]!.blockId);
    const aziziyaRate = rateFor(aziziya.id, stays[1]!.blockId);
    const minaRate = rateFor(mina.id, stays[2]!.blockId);

    const madinahBlock = madinahRate.model === "byOccupancy" ? madinahRate.rates.Quad : 0;
    // Aziziya sharing is a single figure, not broken down by occupancy.
    const aziziyaBlock = aziziyaRate.model === "sharingOrSeparate" ? aziziyaRate.sharing : 0;
    const minaBlock = minaRate.model === "flat" ? minaRate.amount : 0;

    // Block totals are summed directly - nothing is multiplied by nights.
    expect(totals.subtotal).toBe(madinahBlock + aziziyaBlock + minaBlock);
    expect(totals.finalTotal).toBe(totals.subtotal - 30_000);

    expect(priced[0]!.lineTotal).toBe(madinahBlock);
    expect(priced[1]!.lineTotal).toBe(aziziyaBlock);
    expect(priced[2]!.lineTotal).toBe(minaBlock);
    expect(priced[2]!.nights).toBe(5); // nights are carried, not charged

    // Only complaint is the gap between the two stays, which is expected here.
    const issues = validateItinerary(stays, validation);
    expect(issues.every((i) => i.code === "GAP")).toBe(true);
  });
});
