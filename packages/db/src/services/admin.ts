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
  DateBlockModel,
  FlightModel,
  LocationModel,
  MealModel,
  MealNoteModel,
  PackageCategoryModel,
  RateModel,
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
  } else if (model === "sharingOrSeparate") {
    // Sharing is a single figure; only Separate is broken down by occupancy.
    update.sharing = Number(rate.sharing) || 0;
    update.separate = rate.separate ?? {};
    update.rates = null;
    update.amount = null;
  } else {
    update.rates = rate.rates ?? {};
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

export async function upsertAccommodation(id: string | null, data: Record<string, unknown>) {
  if (id) {
    return AccommodationModel.findByIdAndUpdate(id, { $set: data }, { returnDocument: "after" }).lean();
  }
  return AccommodationModel.create(data);
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
