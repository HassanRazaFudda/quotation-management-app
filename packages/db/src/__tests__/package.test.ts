import type { StayInput } from "@junaidi/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { PackageModel } from "../models/package";
import { DEFAULT_SEASON, seed } from "../seed";
import { getConfigBundle } from "../services/config";
import {
  PackageError,
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
