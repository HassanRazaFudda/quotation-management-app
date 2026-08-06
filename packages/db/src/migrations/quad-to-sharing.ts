/**
 * One-time migration for the Quad -> Sharing rename.
 *
 * "Quad" used to be the anchor occupancy: the code a byOccupancy hotel's
 * shared room was always priced and gated on, and what every plain "Sharing"
 * pick stored as its `occupancy` (whatever the hotel's model, and whatever
 * wording - if any - was printed). It is now "Sharing" - Quad is an ordinary
 * wording choice, like Quint or Hexa. Real data written before this change
 * still has the old code in four places:
 *
 *   1. A Rate's `rates.Quad` figure - the shared room's actual price.
 *   2. An Accommodation's `allowedOccupancies` list, which gates whether the
 *      hotel has a shared room at all.
 *   3. A Package's `stays[].occupancy` - a live template, re-validated and
 *      re-priced every time it is printed.
 *   4. A Quotation's `stays[].occupancy` and `stays[].rooms[].occupancy` - a
 *      frozen document that displays fine as-is, but is re-validated the
 *      moment it is edited, duplicated or re-saved.
 *   5. The admin's RoomSize list itself has no "Sharing" row yet - without
 *      one there is nothing to open in Rates to price it, which is the whole
 *      point of this change. One is added per season that already has other
 *      room sizes, rather than requiring a full re-seed (which would also
 *      touch accommodations, rates and blocks - unnecessary here, and unsafe
 *      if the seed's own hotel names have since drifted from the real data).
 *
 * All five are fixed here. `rates.Quad` is copied to `rates.Sharing` and kept
 * in place as a backup rather than removed, so nothing is lost if this needs
 * to be inspected later. Everywhere else "Quad" is replaced with "Sharing" in
 * place, across every location - not just Makkah/Madinah, and not only where
 * the pricing model is byOccupancy - since the occupancy-allowed check in
 * `validateItinerary` runs for any stay with a shared room, whatever its
 * model, and a stay stuck on "Quad" would fail it the moment "Quad" no longer
 * appears in any hotel's `allowedOccupancies`.
 *
 * Safe to re-run: a Rate already carrying `rates.Sharing` is left alone,
 * anything no longer carrying a bare "Quad" occupancy is left alone, and a
 * season that already has a "Sharing" room size is left alone.
 */

import { connect, disconnect } from "../connection";
import { AccommodationModel, RateModel, RoomSizeModel } from "../models/config";
import { PackageModel } from "../models/package";
import { QuotationModel } from "../models/quotation";

export interface QuadToSharingResult {
  ratesMigrated: number;
  accommodationsMigrated: number;
  packagesMigrated: number;
  quotationsMigrated: number;
  roomSizesAdded: number;
}

/** A stay (or room-mix entry) with a plain Sharing pick stuck on "Quad". */
function needsRename(entry: { roomType?: string | null; occupancy?: string | null }): boolean {
  return entry.roomType === "sharing" && entry.occupancy === "Quad";
}

export async function migrateQuadToSharing(): Promise<QuadToSharingResult> {
  let ratesMigrated = 0;
  const rates = await RateModel.find({
    model: "byOccupancy",
    "rates.Quad": { $exists: true },
    "rates.Sharing": { $exists: false },
  });
  for (const rate of rates) {
    const current = rate.rates as Record<string, number> | null;
    if (!current || current.Quad === undefined) continue;
    await RateModel.updateOne(
      { _id: rate._id },
      { $set: { "rates.Sharing": current.Quad } },
    );
    ratesMigrated += 1;
  }

  let accommodationsMigrated = 0;
  const accommodations = await AccommodationModel.find({ allowedOccupancies: "Quad" });
  for (const accommodation of accommodations) {
    const next = (accommodation.allowedOccupancies ?? []).map((code) =>
      code === "Quad" ? "Sharing" : code,
    );
    await AccommodationModel.updateOne(
      { _id: accommodation._id },
      { $set: { allowedOccupancies: next } },
    );
    accommodationsMigrated += 1;
  }

  let packagesMigrated = 0;
  const packages = await PackageModel.find({
    stays: { $elemMatch: { roomType: "sharing", occupancy: "Quad" } },
  }).lean();
  for (const pkg of packages) {
    const stays = (pkg.stays as unknown as Array<Record<string, unknown>>).map((stay) =>
      needsRename(stay) ? { ...stay, occupancy: "Sharing" } : stay,
    );
    await PackageModel.updateOne({ _id: pkg._id }, { $set: { stays } });
    packagesMigrated += 1;
  }

  let quotationsMigrated = 0;
  const quotations = await QuotationModel.find({
    $or: [
      { stays: { $elemMatch: { roomType: "sharing", occupancy: "Quad" } } },
      { "stays.rooms": { $elemMatch: { roomType: "sharing", occupancy: "Quad" } } },
    ],
  }).lean();
  for (const quotation of quotations) {
    const stays = (quotation.stays as unknown as Array<Record<string, unknown>>).map((stay) => {
      const originalRooms = stay.rooms;
      const rooms = Array.isArray(originalRooms)
        ? (originalRooms as Array<Record<string, unknown>>).map((room) =>
            needsRename(room) ? { ...room, occupancy: "Sharing" } : room,
          )
        : originalRooms;
      const renamed = needsRename(stay) ? { ...stay, occupancy: "Sharing" } : stay;
      return rooms !== originalRooms ? { ...renamed, rooms } : renamed;
    });
    await QuotationModel.updateOne({ _id: quotation._id }, { $set: { stays } });
    quotationsMigrated += 1;
  }

  let roomSizesAdded = 0;
  const seasons = await RoomSizeModel.distinct("season");
  for (const season of seasons) {
    const existing = await RoomSizeModel.findOne({ season, code: "Sharing" }).lean();
    if (existing) continue;
    const lowestSortOrder = await RoomSizeModel.findOne({ season })
      .sort({ sortOrder: 1 })
      .lean();
    await RoomSizeModel.create({
      season,
      code: "Sharing",
      label: "Sharing",
      sharingGroupSize: null,
      sortOrder: (lowestSortOrder?.sortOrder ?? 0) - 1,
      active: true,
    });
    roomSizesAdded += 1;
  }

  return { ratesMigrated, accommodationsMigrated, packagesMigrated, quotationsMigrated, roomSizesAdded };
}

// Run directly: pnpm --filter @junaidi/db migrate:quad-to-sharing
if (process.argv[1]?.includes("quad-to-sharing")) {
  await connect();
  const result = await migrateQuadToSharing();
  console.log("Migrated:", result);
  await disconnect();
}
