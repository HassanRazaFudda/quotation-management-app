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
  finalTierTotal,
  hasErrors,
  makePricingContext,
  makeValidationContext,
  offeredTiers,
  priceTiers,
  resolveBlocks,
  validateItinerary,
  type FlightSelection,
  type PackageAddOn,
  type StayInput,
  type TierPricing,
} from "@junaidi/shared";

import { PackageModel } from "../models/package";
import { getConfigBundle } from "./config";
import {
  buildQuotationDocument,
  createQuotation,
  type QuotationAuthor,
  type QuotationInput,
} from "./quotation";

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
  tierPricing?: TierPricingInput;
  addOns?: PackageAddOn[];
}

/** As it arrives from the API - each field optional and a tier possibly null. */
interface TierSettingInput {
  manualTotal?: number | null;
  discount?: number;
}
interface TierPricingInput {
  enabled?: boolean;
  Quad?: TierSettingInput | null;
  Triple?: TierSettingInput | null;
  Double?: TierSettingInput | null;
}

/** Clean one tier's controls for storage, or null when the tier is not offered. */
function toTierDoc(setting: TierSettingInput | null | undefined) {
  if (!setting) return null;
  const manual = setting.manualTotal;
  return {
    manualTotal:
      manual === null || manual === undefined ? null : Math.max(0, Math.round(manual)),
    discount: Math.max(0, Math.round(setting.discount ?? 0)),
  };
}

/** The stored tier-pricing block, normalised from input. */
function toTierPricingDoc(pricing: TierPricingInput | undefined) {
  return {
    enabled: pricing?.enabled ?? false,
    Quad: toTierDoc(pricing?.Quad),
    Triple: toTierDoc(pricing?.Triple),
    Double: toTierDoc(pricing?.Double),
  };
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
    tierPricing: toTierPricingDoc(input.tierPricing),
    addOns: (input.addOns ?? [])
      .map((addOn) => ({
        label: (addOn.label ?? "").trim(),
        amount: Math.max(0, Math.round(addOn.amount ?? 0)),
      }))
      .filter((addOn) => addOn.label.length > 0),
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
 * A package's flight, made safe to render.
 *
 * A brochure must still print if a flight reference is missing, so an
 * incomplete selection is dropped to "not included" rather than failing the
 * whole document - the travel dates come off the itinerary either way.
 */
function packageFlight(flight: PackageDoc["flight"] | undefined): FlightSelection {
  const id = (value: unknown) => (value ? String(value) : null);
  const included = Boolean(flight?.included);
  const roundTrip = Boolean(flight?.roundTrip);
  const returnRequired = flight?.returnRequired ?? true;

  const selection: FlightSelection = {
    included,
    returnRequired,
    roundTrip,
    roundTripId: id(flight?.roundTripId),
    outboundId: id(flight?.outboundId),
    inboundId: id(flight?.inboundId),
  };

  if (included) {
    const haveLeg = roundTrip ? selection.roundTripId : selection.outboundId;
    const haveReturn = roundTrip || !returnRequired || selection.inboundId;
    if (!haveLeg || !haveReturn) return { included: false, returnRequired: true };
  }
  return selection;
}

type PackageDoc = NonNullable<Awaited<ReturnType<typeof getPackage>>>;

/** One tier as it will print: its label and a single final figure. */
export interface PackageTierPrice {
  label: string;
  total: number;
}

/**
 * Everything the renderer needs for a package brochure, resolved live.
 *
 * The itinerary is denormalised through the same path a quotation uses, so a
 * package always reflects today's rates. On top of that the tier prices are
 * computed - each offered tier priced with the hotels at that occupancy, then
 * finalised with its own manual override and discount. Only the final figures
 * are returned; the discount never leaves the server.
 */
export interface PackagePrintOptions {
  /** Optional customer, shown on the brochure only when a name is given. */
  guest?: { name: string; pax: number };
  validUntil?: string | null;
  /**
   * A negotiated discount taken off every printed price. Internal, like a
   * quotation's - only the reduced figures reach the page, never the amount.
   */
  discount?: number;
  /** The staff member who printed it, shown in the footer. */
  generatedBy?: string;
}

export async function buildPackagePdfBundle(
  id: string,
  options: PackagePrintOptions = {},
): Promise<{
  doc: Awaited<ReturnType<typeof buildQuotationDocument>>;
  tierPrices: PackageTierPrice[];
  addOns: PackageAddOn[];
  name: string;
}> {
  const pkg = await getPackage(id);
  if (!pkg) throw new PackageError("Package not found.");

  const guestName = options.guest?.name?.trim() ?? "";
  const guest = { name: guestName, pax: Math.max(1, options.guest?.pax ?? 1) };
  const discount = Math.max(0, Math.round(options.discount ?? 0));

  const stays: StayInput[] = pkg.stays.map((stay) => ({
    blockId: String(stay.blockId),
    locationId: String(stay.locationId),
    accommodationId: String(stay.accommodationId),
    roomType: (stay.roomType as StayInput["roomType"]) ?? null,
    occupancy: (stay.occupancy as StayInput["occupancy"]) ?? null,
    sharingWord: (stay.sharingWord as StayInput["sharingWord"]) ?? null,
    mealId: stay.mealId ? String(stay.mealId) : null,
    mealNoteId: stay.mealNoteId ? String(stay.mealNoteId) : null,
  }));
  const ids = (list: unknown[] | undefined) => (list ?? []).map((value) => String(value));

  const input: QuotationInput = {
    season: pkg.season,
    guest,
    date: new Date(),
    validUntil: options.validUntil ?? null,
    packageTitle: pkg.packageTitle ?? "",
    packageCategory: pkg.packageCategory ?? "",
    withoutMina: pkg.withoutMina ?? false,
    qurbaniIncluded: pkg.qurbaniIncluded ?? true,
    stays,
    flight: packageFlight(pkg.flight),
    minaServiceIds: ids(pkg.minaServiceIds),
    arafatServiceIds: ids(pkg.arafatServiceIds),
    includeIds: ids(pkg.includeIds),
    requirementIds: ids(pkg.requirementIds),
    termIds: ids(pkg.termIds),
    includesNote: pkg.includesNote ?? "",
    remarks: pkg.remarks ?? "",
    // A single-price package prints its discounted total; the tier case applies
    // the same discount to each tier below.
    discount,
  };

  // A package has no reference number, but it does carry who printed it, for
  // the footer. The customer and money still stay off the stored template.
  const doc = await buildQuotationDocument(
    input,
    { userId: "", name: options.generatedBy ?? "", role: "admin" },
    "",
  );

  const bundle = await getConfigBundle(pkg.season);
  const blocks = resolveBlocks(bundle.blocks, bundle.calendar);
  const pricing = makePricingContext({
    blocks,
    accommodations: bundle.accommodations,
    locations: bundle.locations,
    rates: bundle.rates,
  });
  const auto = new Map(priceTiers(stays, pricing).map((tier) => [tier.occupancy, tier.total]));
  // The flight fare is the same across tiers, so it sits on every one.
  const flightTotal = doc.flight?.total ?? 0;

  const tierPrices = offeredTiers(pkg.tierPricing as TierPricing).map(({ occupancy, setting }) => ({
    label: occupancy,
    // The negotiated print discount comes off every tier's final figure.
    total: Math.max(0, finalTierTotal((auto.get(occupancy) ?? 0) + flightTotal, setting) - discount),
  }));

  const addOns: PackageAddOn[] = (pkg.addOns ?? []).map((addOn) => ({
    label: addOn.label ?? "",
    amount: addOn.amount ?? 0,
  }));

  return { doc, tierPrices, addOns, name: pkg.name };
}

export interface PackageQuoteOptions {
  guest: { name: string; pax: number };
  validUntil?: string | null;
  discount?: number;
  /** For a tiered package, the room tier this customer is quoted at. */
  tier?: "Quad" | "Triple" | "Double" | null;
}

/**
 * Turn a package into a real customer quotation.
 *
 * This is the bridge between the brochure and a booking: a package prices three
 * tiers, but an individual quotation is one price, so the chosen tier sets the
 * hotel occupancy and everything else is quoted from it. The result is an
 * ordinary draft quotation - it lists, edits, prints and confirms (with an HB
 * number) exactly like any other.
 */
export async function createQuotationFromPackage(
  id: string,
  author: QuotationAuthor,
  options: PackageQuoteOptions,
) {
  const pkg = await getPackage(id);
  if (!pkg) throw new PackageError("Package not found.");

  const bundle = await getConfigBundle(pkg.season);
  const accById = new Map(bundle.accommodations.map((a) => [a.id, a]));
  const locById = new Map(bundle.locations.map((l) => [l.id, l]));
  const tier = options.tier ?? null;

  const stays: StayInput[] = pkg.stays.map((stay) => {
    const base: StayInput = {
      blockId: String(stay.blockId),
      locationId: String(stay.locationId),
      accommodationId: String(stay.accommodationId),
      roomType: (stay.roomType as StayInput["roomType"]) ?? null,
      occupancy: (stay.occupancy as StayInput["occupancy"]) ?? null,
      sharingWord: (stay.sharingWord as StayInput["sharingWord"]) ?? null,
      mealId: stay.mealId ? String(stay.mealId) : null,
      mealNoteId: stay.mealNoteId ? String(stay.mealNoteId) : null,
    };
    // The tier sets the hotel occupancy; Aziziya and Mina keep their own room.
    const accommodation = accById.get(base.accommodationId);
    const location = accommodation ? locById.get(accommodation.locationId) : undefined;
    if (tier && location?.pricingModel === "byOccupancy") {
      return { ...base, roomType: "sharing", occupancy: tier, sharingWord: null };
    }
    return base;
  });

  const ids = (list: unknown[] | undefined) => (list ?? []).map((value) => String(value));

  const input: QuotationInput = {
    season: pkg.season,
    guest: { name: options.guest.name.trim(), pax: Math.max(1, options.guest.pax) },
    date: new Date(),
    validUntil: options.validUntil ?? null,
    packageTitle: pkg.packageTitle ?? "",
    packageCategory: pkg.packageCategory ?? "",
    withoutMina: pkg.withoutMina ?? false,
    qurbaniIncluded: pkg.qurbaniIncluded ?? true,
    stays,
    flight: packageFlight(pkg.flight),
    minaServiceIds: ids(pkg.minaServiceIds),
    arafatServiceIds: ids(pkg.arafatServiceIds),
    includeIds: ids(pkg.includeIds),
    requirementIds: ids(pkg.requirementIds),
    termIds: ids(pkg.termIds),
    includesNote: pkg.includesNote ?? "",
    remarks: pkg.remarks ?? "",
    discount: Math.max(0, Math.round(options.discount ?? 0)),
    status: "draft",
  };

  return createQuotation(input, author);
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
