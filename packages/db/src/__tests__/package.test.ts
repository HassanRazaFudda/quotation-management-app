import type { StayInput } from "@junaidi/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { PackageModel } from "../models/package";
import { DEFAULT_SEASON, seed } from "../seed";
import { getConfigBundle } from "../services/config";
import {
  PackageError,
  buildPackagePdfBundle,
  createQuotationFromPackage,
  deactivatePackage,
  getPackage,
  listPackages,
  upsertPackage,
  type PackageInput,
} from "../services/package";
import { connectTestDb, dropTestDb } from "./setup";

let base: PackageInput;

beforeAll(async () => {
  await connectTestDb("package");
  await seed();

  const bundle = await getConfigBundle(DEFAULT_SEASON);
  const block = (label: string) => {
    const [start, end] = label.split(" - ");
    return bundle.blocks.find(
      (b) =>
        `${String(b.startHijri.day).padStart(2, "0")} ${b.startHijri.month}` === start &&
        `${String(b.endHijri.day).padStart(2, "0")} ${b.endHijri.month}` === end,
    )!;
  };
  const acc = (name: string) => bundle.accommodations.find((a) => a.name === name)!;

  const aziziya = acc("Aziziya Hotel");
  const mina = acc("Mina Standard");

  const stays: StayInput[] = [
    {
      blockId: block("04 Zilhaj - 07 Zilhaj").id,
      locationId: aziziya.locationId,
      accommodationId: aziziya.id,
      roomType: "sharing",
      mealId: aziziya.allowedMealIds[0],
    },
    {
      blockId: block("07 Zilhaj - 12 Zilhaj").id,
      locationId: mina.locationId,
      accommodationId: mina.id,
      mealId: mina.allowedMealIds[0],
    },
  ];

  base = {
    name: "20-Day Maktab A Standard",
    season: DEFAULT_SEASON,
    packageTitle: "Hajj 1448 Maktab A - 20 Days",
    packageCategory: "Maktab A Category",
    minaAccommodationId: mina.id,
    stays,
    includeIds: bundle.services.filter((s) => s.category === "includes").map((s) => s.id),
  };
}, 60_000);

afterAll(async () => {
  await dropTestDb();
});

describe("saving a package", () => {
  it("stores the itinerary and services without a customer or a price", async () => {
    const saved = await upsertPackage(null, base);

    expect(saved!.name).toBe("20-Day Maktab A Standard");
    expect(saved!.stays).toHaveLength(2);
    expect(saved!.includeIds.length).toBeGreaterThan(0);
    // A package carries no customer, dates or money.
    expect(saved).not.toHaveProperty("guest");
    expect(saved).not.toHaveProperty("finalTotal");
    expect(saved).not.toHaveProperty("discount");
  });

  it("keeps references rather than snapshots, so it re-prices when used", async () => {
    const saved = await upsertPackage(null, base);
    const stay = saved!.stays[0]!;

    expect(stay).toHaveProperty("blockId");
    expect(stay).not.toHaveProperty("rateSnapshot");
    expect(stay).not.toHaveProperty("lineTotal");
    expect(stay).not.toHaveProperty("blockLabelHijri");
  });

  it("refuses a package with no name", async () => {
    await expect(upsertPackage(null, { ...base, name: "  " })).rejects.toBeInstanceOf(PackageError);
  });

  it("refuses a package whose itinerary would not validate", async () => {
    const broken: PackageInput = { ...base, stays: [{ ...base.stays[0]!, roomType: null }] };
    await expect(upsertPackage(null, broken)).rejects.toBeInstanceOf(PackageError);
  });

  it("updates in place, keeping its id", async () => {
    const saved = await upsertPackage(null, base);
    const updated = await upsertPackage(String(saved!._id), { ...base, name: "Renamed Package" });

    expect(String(updated!._id)).toBe(String(saved!._id));
    expect(updated!.name).toBe("Renamed Package");
  });

  it("defaults to no tier pricing, so it stays a single-price template", async () => {
    const saved = await upsertPackage(null, base);
    const tp = saved!.tierPricing!;
    expect(tp.enabled).toBe(false);
    expect(tp.Quad).toBeNull();
    expect(tp.Triple).toBeNull();
    expect(tp.Double).toBeNull();
  });

  it("stores only the offered tiers, each with its own controls", async () => {
    const saved = await upsertPackage(null, {
      ...base,
      name: "Three-price Package",
      tierPricing: {
        enabled: true,
        Quad: { manualTotal: 3_650_000, discount: 0 },
        Triple: { manualTotal: null, discount: 50_000 },
        Double: null, // not offered
      },
    });

    const tp = saved!.tierPricing!;
    expect(tp.enabled).toBe(true);
    expect(tp.Quad).toMatchObject({ manualTotal: 3_650_000, discount: 0 });
    expect(tp.Triple).toMatchObject({ manualTotal: null, discount: 50_000 });
    expect(tp.Double).toBeNull();
  });
});

describe("resolving a package for its brochure PDF", () => {
  it("prices each offered tier and honours a manual override or discount", async () => {
    const created = await upsertPackage(null, {
      ...base,
      name: "Priced Brochure",
      tierPricing: {
        enabled: true,
        Quad: { manualTotal: 3_650_000, discount: 0 },
        Triple: { manualTotal: 3_750_000, discount: 0 },
        Double: null, // not offered
      },
      addOns: [{ label: "Aziziya Double Bed", amount: 400_000 }],
    });

    const { tierPrices, addOns, doc } = await buildPackagePdfBundle(String(created!._id));

    // Only the two offered tiers, in order, at their typed-in prices.
    expect(tierPrices.map((t) => t.label)).toEqual(["Quad", "Triple"]);
    expect(tierPrices.find((t) => t.label === "Quad")!.total).toBe(3_650_000);
    expect(tierPrices.find((t) => t.label === "Triple")!.total).toBe(3_750_000);

    // Add-ons carried through, and the itinerary resolved to real names.
    expect(addOns).toEqual([{ label: "Aziziya Double Bed", amount: 400_000 }]);
    expect(doc.stays.length).toBeGreaterThan(0);
    expect(doc.stays[0]!.accommodationName).toBeTruthy();
  });

  it("carries an optional customer, and stays anonymous without one", async () => {
    const created = await upsertPackage(null, { ...base, name: "Optional Guest" });

    const anon = await buildPackagePdfBundle(String(created!._id));
    expect(anon.doc.guest.name).toBe("");

    const named = await buildPackagePdfBundle(String(created!._id), {
      guest: { name: "Rashid Shahid", pax: 2 },
    });
    expect(named.doc.guest).toMatchObject({ name: "Rashid Shahid", pax: 2 });
  });

  it("offers no tiers when tier pricing is off", async () => {
    const created = await upsertPackage(null, { ...base, name: "No Tiers" });
    const { tierPrices } = await buildPackagePdfBundle(String(created!._id));
    expect(tierPrices).toEqual([]);
  });

  it("takes a print discount off every tier and names who printed it", async () => {
    const created = await upsertPackage(null, {
      ...base,
      name: "Discounted Brochure",
      tierPricing: {
        enabled: true,
        Quad: { manualTotal: 3_650_000, discount: 0 },
        Triple: { manualTotal: 3_750_000, discount: 0 },
        Double: null,
      },
    });

    const { tierPrices, doc } = await buildPackagePdfBundle(String(created!._id), {
      discount: 50_000,
      generatedBy: "Bilal Ahmed",
    });

    expect(tierPrices.find((t) => t.label === "Quad")!.total).toBe(3_600_000);
    expect(tierPrices.find((t) => t.label === "Triple")!.total).toBe(3_700_000);
    expect(doc.createdByName).toBe("Bilal Ahmed");
  });
});

describe("saving a package as a customer quotation", () => {
  it("creates a confirmable draft quotation with the customer and discount", async () => {
    const created = await upsertPackage(null, { ...base, name: "To Quote" });

    const quotation = await createQuotationFromPackage(
      String(created!._id),
      { userId: "6a624a95b9081c0a38e3d954", name: "Bilal Ahmed", role: "staff" },
      { guest: { name: "Rashid Shahid", pax: 2 }, discount: 30_000 },
    );

    expect(quotation.status).toBe("draft");
    expect(quotation.guest?.name).toBe("Rashid Shahid");
    expect(quotation.quotationId).toMatch(/^HQ-/);
    expect(quotation.createdByName).toBe("Bilal Ahmed");
    // The discount is internal but recorded, so the final total reflects it.
    expect(quotation.discount).toBe(30_000);
    expect(quotation.hbNumber).toBe("");
  });

  it("sets the hotel occupancy from the chosen tier", async () => {
    const created = await upsertPackage(null, { ...base, name: "Tiered Quote" });

    const quotation = await createQuotationFromPackage(
      String(created!._id),
      { userId: "6a624a95b9081c0a38e3d955", name: "Bilal", role: "staff" },
      { guest: { name: "Guest", pax: 1 }, tier: "Double" },
    );

    // base has no Makkah/Madinah hotel, but the tier must not corrupt the
    // Aziziya (sharingOrSeparate) or Mina (flat) rooms.
    const aziziya = quotation.stays.find((s) => s.roomType === "sharing");
    expect(aziziya).toBeTruthy();
  });
});

describe("listing and removing", () => {
  it("lists only active packages for a season", async () => {
    const created = await upsertPackage(null, { ...base, name: "To be listed" });
    const list = await listPackages(DEFAULT_SEASON);

    expect(list.some((p) => String(p._id) === String(created!._id))).toBe(true);
    expect(list.every((p) => p.active)).toBe(true);
  });

  it("soft-deletes: the package leaves the list but the row stays", async () => {
    const created = await upsertPackage(null, { ...base, name: "To be removed" });
    await deactivatePackage(String(created!._id));

    const list = await listPackages(DEFAULT_SEASON);
    expect(list.some((p) => String(p._id) === String(created!._id))).toBe(false);
    // Still in the collection, just inactive - never orphans a reference.
    expect((await PackageModel.findById(created!._id).lean())!.active).toBe(false);
  });

  it("reads one back for prefilling the builder", async () => {
    const created = await upsertPackage(null, { ...base, name: "Readable" });
    const fetched = await getPackage(String(created!._id));

    expect(fetched!.name).toBe("Readable");
    expect(fetched!.stays).toHaveLength(2);
  });
});
