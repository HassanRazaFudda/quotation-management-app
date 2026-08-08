/**
 * Admin write operations for the configuration collections.
 *
 * These back the settings screens. Each validates just enough to keep the
 * collections consistent - e.g. a rate's shape must match its location's
 * pricing model, or the builder would break for that hotel.
 */

import type { PricingModel } from "@junaidi/shared";

import {
  AccommodationModel,
  CurrencyModel,
  DateBlockModel,
  FlightModel,
  LocationModel,
  MealModel,
  MealNoteModel,
  MinaTierModel,
  PackageCategoryModel,
  RateModel,
  RoomSizeModel,
  ServiceItemModel,
} from "../models/config";

export class AdminError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AdminError";
  }
}

/**
 * Upsert the rate for one accommodation in one block, checking its shape.
 *
 * A rate is the negotiated total for that whole block, so it is stored against
 * the block rather than as a nightly figure.
 */
export async function upsertRate(
  accommodationId: string,
  blockId: string,
  season: string,
  rate: Record<string, unknown>,
) {
  const accommodation = await AccommodationModel.findById(accommodationId).lean();
  if (!accommodation) throw new AdminError("Accommodation not found.");

  const block = await DateBlockModel.findById(blockId).lean();
  if (!block) throw new AdminError("Date block not found.");

  const location = await LocationModel.findById(accommodation.locationId).lean();
  if (!location) throw new AdminError("Location not found.");

  const allowed = (block.allowedLocationIds ?? []).some(
    (id) => String(id) === String(accommodation.locationId),
  );
  if (!allowed) {
    throw new AdminError(
      `${location.name} is not allowed in that date block, so it cannot have a rate for it.`,
    );
  }

  const narrowedBlockIds = (accommodation.allowedBlockIds ?? []).map(String);
  if (narrowedBlockIds.length > 0 && !narrowedBlockIds.includes(String(blockId))) {
    throw new AdminError(
      `"${accommodation.name}" is not offered in that date block, so it cannot have a rate for it.`,
    );
  }

  const model = location.pricingModel as PricingModel;
  if (rate.model && rate.model !== model) {
    throw new AdminError(`This hotel is priced as ${model}, not ${String(rate.model)}.`);
  }

  const update: Record<string, unknown> = { accommodationId, blockId, season, model };

  if (model === "flat") {
    update.amount = Number(rate.amount) || 0;
    update.rates = null;
    update.sharing = null;
    update.separate = null;
    update.withoutBed = 0; // a tent has no bed to price
  } else if (model === "sharingOrSeparate") {
    // Sharing is a single figure; only Separate is broken down by occupancy.
    update.sharing = Number(rate.sharing) || 0;
    update.separate = rate.separate ?? {};
    update.withoutBed = Math.max(0, Number(rate.withoutBed) || 0);
    update.rates = null;
    update.amount = null;
  } else {
    update.rates = rate.rates ?? {};
    update.withoutBed = Math.max(0, Number(rate.withoutBed) || 0);
    update.amount = null;
    update.sharing = null;
    update.separate = null;
  }

  return RateModel.findOneAndUpdate(
    { accommodationId, blockId, season },
    { $set: update },
    { upsert: true, returnDocument: "after" },
  ).lean();
}

// --- simple label list operations (meals, meal notes, services) ------------

// A minimal Model shape - the three collections share these methods, and the
// concrete union confuses TypeScript when the method is called generically.
type AnyModel = {
  create: (data: Record<string, unknown>) => Promise<unknown>;
  findByIdAndUpdate: (
    id: string,
    update: Record<string, unknown>,
    options?: Record<string, unknown>,
  ) => { lean: () => Promise<unknown> };
};

const MODELS: Record<"meal" | "mealNote" | "service" | "packageCategory", AnyModel> = {
  meal: MealModel as unknown as AnyModel,
  mealNote: MealNoteModel as unknown as AnyModel,
  service: ServiceItemModel as unknown as AnyModel,
  packageCategory: PackageCategoryModel as unknown as AnyModel,
};

export async function createLabelled(
  kind: keyof typeof MODELS,
  data: Record<string, unknown>,
) {
  return MODELS[kind].create(data);
}

export async function updateLabelled(
  kind: keyof typeof MODELS,
  id: string,
  data: Record<string, unknown>,
) {
  return MODELS[kind].findByIdAndUpdate(id, { $set: data }, { returnDocument: "after" }).lean();
}

export async function deactivate(kind: keyof typeof MODELS, id: string) {
  return MODELS[kind].findByIdAndUpdate(id, { $set: { active: false } }).lean();
}

// --- hotels ----------------------------------------------------------------

/**
 * A size is either its own priced room or wording for the Sharing rate -
 * never both, or the quotation dropdown would show two different meanings for
 * the same word (e.g. "Quint" as wording and "Quint" as a real room). One
 * uniform rule, no exceptions - "Quad" included: it is an ordinary wording
 * choice like Quint or Hexa, not the anchor rate ("Sharing" is), so it is
 * refused the same way if a hotel lists it in both places.
 */
function assertNoSizeOverlap(data: Record<string, unknown>): void {
  const occupancies = Array.isArray(data.allowedOccupancies) ? data.allowedOccupancies : [];
  const words = Array.isArray(data.allowedSharingWords) ? data.allowedSharingWords : [];
  const overlap = occupancies.filter((code) => words.includes(code));
  if (overlap.length > 0) {
    throw new AdminError(
      `"${overlap.join(", ")}" cannot be both a priced room size and Sharing wording on the same hotel.`,
    );
  }
}

/**
 * Every date block a hotel is narrowed to must actually allow its location -
 * otherwise the hotel could be "available" in a block its own location is
 * refused in, which `upsertRate` and the builder would then have to guess
 * how to handle.
 */
async function assertBlocksAllowed(locationId: unknown, blockIds: unknown): Promise<void> {
  const ids = Array.isArray(blockIds) ? blockIds : [];
  if (ids.length === 0) return;

  const blocks = await DateBlockModel.find({ _id: { $in: ids } })
    .select("allowedLocationIds")
    .lean();
  const valid =
    blocks.length === ids.length &&
    blocks.every((block) =>
      (block.allowedLocationIds ?? []).some((allowed) => String(allowed) === String(locationId)),
    );
  if (!valid) {
    throw new AdminError("One of the selected date blocks does not allow this hotel's location.");
  }
}

export async function upsertAccommodation(id: string | null, data: Record<string, unknown>) {
  assertNoSizeOverlap(data);
  await assertBlocksAllowed(data.locationId, data.allowedBlockIds);
  if (id) {
    return AccommodationModel.findByIdAndUpdate(id, { $set: data }, { returnDocument: "after" }).lean();
  }
  return AccommodationModel.create(data);
}

/**
 * Reorder the hotels/tents within one location: `orderedIds` is the full new
 * order, and each gets `sortOrder` set to its index. Ids from another location
 * are ignored, so a stale list can never scramble a different group.
 */
export async function reorderAccommodations(locationId: string, orderedIds: string[]) {
  const belongs = await AccommodationModel.find({ _id: { $in: orderedIds }, locationId })
    .select("_id")
    .lean();
  const validIds = new Set(belongs.map((doc) => String(doc._id)));

  const ops = orderedIds
    .filter((id) => validIds.has(id))
    .map((id, index) => ({
      updateOne: { filter: { _id: id }, update: { $set: { sortOrder: index } } },
    }));
  if (ops.length > 0) await AccommodationModel.bulkWrite(ops);
}

/**
 * Soft delete: the hotel or tent disappears from the builder, but quotations
 * that already used it keep their own copy of its name and rates.
 */
export async function deactivateAccommodation(id: string) {
  const accommodation = await AccommodationModel.findByIdAndUpdate(
    id,
    { $set: { active: false } },
    { returnDocument: "after" },
  ).lean();
  if (!accommodation) throw new AdminError("Accommodation not found.");
  return accommodation;
}

// --- date blocks -----------------------------------------------------------

export async function upsertDateBlock(id: string | null, data: Record<string, unknown>) {
  if (id) {
    return DateBlockModel.findByIdAndUpdate(id, { $set: data }, { returnDocument: "after" }).lean();
  }
  return DateBlockModel.create(data);
}

/**
 * Soft delete: the block disappears from the builder, but quotations that used
 * it keep their own copy of its dates and rates already reference it.
 */
export async function deactivateDateBlock(id: string) {
  const block = await DateBlockModel.findByIdAndUpdate(
    id,
    { $set: { active: false } },
    { returnDocument: "after" },
  ).lean();
  if (!block) throw new AdminError("Date block not found.");
  return block;
}

// --- flights ---------------------------------------------------------------

export async function upsertFlight(id: string | null, data: Record<string, unknown>) {
  if (id) {
    return FlightModel.findByIdAndUpdate(id, { $set: data }, { returnDocument: "after" }).lean();
  }
  return FlightModel.create(data);
}

/** Soft delete: saved quotations already hold their own copy of the sector. */
export async function deactivateFlight(id: string) {
  return FlightModel.findByIdAndUpdate(id, { $set: { active: false } }).lean();
}

export async function upsertCurrency(id: string | null, data: Record<string, unknown>) {
  if (id) {
    return CurrencyModel.findByIdAndUpdate(id, { $set: data }, { returnDocument: "after" }).lean();
  }
  return CurrencyModel.create(data);
}

/** Soft delete: a quotation already froze its own rate, so this is safe. */
export async function deactivateCurrency(id: string) {
  return CurrencyModel.findByIdAndUpdate(id, { $set: { active: false } }).lean();
}

// --- room sizes --------------------------------------------------------

export async function upsertRoomSize(id: string | null, data: Record<string, unknown>) {
  if (id) {
    return RoomSizeModel.findByIdAndUpdate(id, { $set: data }, { returnDocument: "after" }).lean();
  }
  return RoomSizeModel.create(data);
}

/**
 * Soft delete: a hotel that already had this size picked keeps the code on
 * its own allowed lists (plain strings, no reference), so nothing there breaks -
 * it simply stops being offered to a hotel configured for the first time.
 */
export async function deactivateRoomSize(id: string) {
  return RoomSizeModel.findByIdAndUpdate(id, { $set: { active: false } }).lean();
}

// --- mina tiers ----------------------------------------------------------

export async function upsertMinaTier(id: string | null, data: Record<string, unknown>) {
  if (id) {
    return MinaTierModel.findByIdAndUpdate(id, { $set: data }, { returnDocument: "after" }).lean();
  }
  return MinaTierModel.create(data);
}

/**
 * Soft delete: an accommodation that already had this tier picked keeps the
 * code on its own `minaTier` field (a plain string, no reference), and a
 * quotation already printed from it keeps its own frozen copy - so nothing
 * already saved breaks. It simply stops being offered to a Mina option
 * configured for the first time.
 */
export async function deactivateMinaTier(id: string) {
  return MinaTierModel.findByIdAndUpdate(id, { $set: { active: false } }).lean();
}
