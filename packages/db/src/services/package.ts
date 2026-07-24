/**
 * Predefined packages.
 *
 * A package is a quotation without a customer: the same itinerary and service
 * validation runs here as on a real quotation, so a package can never be saved
 * in a state a quotation could not be built from. Pricing is deliberately not
 * run or stored - a package re-prices against live config when it is used.
 */

import {
  errorsOnly,
  hasErrors,
  makeValidationContext,
  resolveBlocks,
  validateItinerary,
  type FlightSelection,
  type StayInput,
} from "@junaidi/shared";

import { PackageModel } from "../models/package";
import { getConfigBundle } from "./config";

export class PackageError extends Error {
  constructor(
    message: string,
    readonly issues: string[] = [],
  ) {
    super(message);
    this.name = "PackageError";
  }
}

export interface PackageInput {
  name: string;
  season: string;
  packageTitle?: string;
  packageCategory?: string;
  withoutMina?: boolean;
  qurbaniIncluded?: boolean;
  minaAccommodationId?: string | null;
  stays: StayInput[];
  flight?: FlightSelection;
  minaServiceIds?: string[];
  arafatServiceIds?: string[];
  includeIds?: string[];
  requirementIds?: string[];
  termIds?: string[];
  includesNote?: string;
  remarks?: string;
}

async function assertValidItinerary(input: PackageInput): Promise<void> {
  const bundle = await getConfigBundle(input.season);
  const blocks = resolveBlocks(bundle.blocks, bundle.calendar);

  const validation = makeValidationContext({
    blocks,
    locations: bundle.locations,
    accommodations: bundle.accommodations,
    meals: bundle.meals,
    mealNotes: bundle.mealNotes,
    withoutMina: input.withoutMina ?? false,
  });

  const issues = validateItinerary(input.stays, validation);
  if (hasErrors(issues)) {
    throw new PackageError(
      "This package's itinerary is not valid yet.",
      errorsOnly(issues).map((issue) => issue.message),
    );
  }
}

/** The document shape stored for a package, built from validated input. */
function toDocument(input: PackageInput) {
  return {
    name: input.name.trim(),
    season: input.season,
    packageTitle: input.packageTitle ?? "",
    packageCategory: input.packageCategory ?? "",
    withoutMina: input.withoutMina ?? false,
    qurbaniIncluded: input.qurbaniIncluded ?? true,
    minaAccommodationId: input.minaAccommodationId || null,
    stays: input.stays.map((stay) => ({
      blockId: stay.blockId,
      locationId: stay.locationId,
      accommodationId: stay.accommodationId,
      roomType: stay.roomType ?? null,
      occupancy: stay.occupancy ?? null,
      sharingWord: stay.sharingWord ?? null,
      mealId: stay.mealId ?? null,
      mealNoteId: stay.mealNoteId ?? null,
    })),
    flight: {
      included: input.flight?.included ?? false,
      returnRequired: input.flight?.returnRequired ?? true,
      roundTrip: input.flight?.roundTrip ?? false,
      outboundId: input.flight?.outboundId || null,
      inboundId: input.flight?.inboundId || null,
      roundTripId: input.flight?.roundTripId || null,
    },
    minaServiceIds: input.minaServiceIds ?? [],
    arafatServiceIds: input.arafatServiceIds ?? [],
    includeIds: input.includeIds ?? [],
    requirementIds: input.requirementIds ?? [],
    termIds: input.termIds ?? [],
    includesNote: input.includesNote ?? "",
    remarks: input.remarks ?? "",
  };
}

export async function upsertPackage(id: string | null, input: PackageInput) {
  if (!input.name.trim()) {
    throw new PackageError("A package needs a name.");
  }
  if (input.stays.length === 0) {
    throw new PackageError("A package needs at least one stay.");
  }
  await assertValidItinerary(input);

  const doc = toDocument(input);
  if (id) {
    return PackageModel.findByIdAndUpdate(id, { $set: doc }, { returnDocument: "after" }).lean();
  }
  return (await PackageModel.create(doc)).toJSON();
}

export async function listPackages(season?: string) {
  const query: Record<string, unknown> = { active: true };
  if (season) query.season = season;
  return PackageModel.find(query).sort({ sortOrder: 1, name: 1 }).lean();
}

export async function getPackage(id: string) {
  return PackageModel.findById(id).lean();
}

/**
 * Soft delete: the package drops out of the picker, but this never touches the
 * quotations that were once started from it - those are their own documents.
 */
export async function deactivatePackage(id: string) {
  const pkg = await PackageModel.findByIdAndUpdate(
    id,
    { $set: { active: false } },
    { returnDocument: "after" },
  ).lean();
  if (!pkg) throw new PackageError("Package not found.");
  return pkg;
}
