/**
 * Predefined packages.
 *
 * A package is a quotation without a customer: the same itinerary and service
 * validation runs here as on a real quotation, so a package can never be saved
 * in a state a quotation could not be built from. Pricing is deliberately not
 * run or stored - a package re-prices against live config when it is used.
 */

import {
  convertFromPkr,
  errorsOnly,
  finalTierTotal,
  hasErrors,
  makePricingContext,
  makeValidationContext,
  offeredTiers,
  priceTiers,
  resolveBlocks,
  roundToDecimals,
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
  /** The currency this package is authored and printed in. Defaults to PKR. */
  currencyCode?: string;
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

/**
 * Clean one tier's controls for storage, or null when the tier is not offered.
 * Typed directly in the package's own currency, so this only clamps and rounds
 * to a safe precision - it cannot know that currency's exact decimals here.
 */
function toTierDoc(setting: TierSettingInput | null | undefined) {
  if (!setting) return null;
  const manual = setting.manualTotal;
  return {
    manualTotal:
      manual === null || manual === undefined ? null : Math.max(0, roundToDecimals(manual, 2)),
    discount: Math.max(0, roundToDecimals(setting.discount ?? 0, 2)),
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
    currencyCode: input.currencyCode || "PKR",
    tierPricing: toTierPricingDoc(input.tierPricing),
    // Typed directly in the package's own currency, like the tier controls
    // above - rounded to a safe precision, not converted.
    addOns: (input.addOns ?? [])
      .map((addOn) => ({
        label: (addOn.label ?? "").trim(),
        amount: Math.max(0, roundToDecimals(addOn.amount ?? 0, 2)),
        appliesToTier: addOn.appliesToTier ?? null,
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

/** The handful of fields `packageFlight` reads - a saved doc and a raw `FlightSelection` both satisfy this. */
interface FlightLike {
  included?: boolean | null;
  roundTrip?: boolean | null;
  returnRequired?: boolean | null;
  roundTripId?: unknown;
  outboundId?: unknown;
  inboundId?: unknown;
}

/**
 * A package's flight, made safe to render.
 *
 * A brochure must still print if a flight reference is missing, so an
 * incomplete selection is dropped to "not included" rather than failing the
 * whole document - the travel dates come off the itinerary either way.
 */
function packageFlight(flight: FlightLike | null | undefined): FlightSelection {
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
 * An add-on as it prints: still shows its own charge, but also whether this
 * particular print includes it - that's what tells the brochure to fold its
 * amount into the tier totals below, instead of printing it as an available
 * extra.
 */
export interface PackagePrintAddOn extends PackageAddOn {
  included: boolean;
}

/**
 * Price every offered tier and resolve the add-on list, shared between a
 * saved package's real brochure and a live preview of one still being
 * edited.
 *
 * An add-on not named in `includedAddOns` prints as an available extra and
 * never touches a tier total. One that is included stops printing as a
 * separate line - its amount is already inside the tier price it applies to,
 * so showing it again would look like a double charge - and folds into every
 * tier it applies to: all three, unless it is tied to just Triple or Double
 * (Aziziya's Separate room upgrade over the Sharing rate already baked into
 * every tier), in which case it only ever moves that one tier.
 */
async function priceTiersAndAddOns(params: {
  season: string;
  stays: StayInput[];
  tierPricing: TierPricing | null | undefined;
  addOns:
    | Array<{ label?: string | null; amount?: number | null; appliesToTier?: string | null }>
    | undefined;
  includedAddOns: string[] | undefined;
  flightTotal: number;
  exchangeRate: number;
  decimals: number;
  discount: number;
}): Promise<{ tierPrices: PackageTierPrice[]; addOns: PackagePrintAddOn[] }> {
  // Only the auto-calculated figure needs this - it comes from real hotel
  // rates, which are always PKR. Everything the admin typed by hand (tier
  // manual totals/discounts, add-on amounts, the print discount) is already
  // in the package's currency and needs no conversion.
  const toCurrency = (pkr: number) =>
    roundToDecimals(convertFromPkr(pkr, params.exchangeRate), params.decimals);

  const bundle = await getConfigBundle(params.season);
  const blocks = resolveBlocks(bundle.blocks, bundle.calendar);
  const pricing = makePricingContext({
    blocks,
    accommodations: bundle.accommodations,
    locations: bundle.locations,
    rates: bundle.rates,
  });
  const auto = new Map(priceTiers(params.stays, pricing).map((tier) => [tier.occupancy, tier.total]));

  const includedLabels = params.includedAddOns ?? [];
  const includedFor = (occupancy: string) =>
    roundToDecimals(
      (params.addOns ?? [])
        .filter(
          (addOn) =>
            includedLabels.includes(addOn.label ?? "") &&
            (!addOn.appliesToTier || addOn.appliesToTier === occupancy),
        )
        .reduce((sum, addOn) => sum + (addOn.amount ?? 0), 0),
      params.decimals,
    );

  const tierPrices = offeredTiers(params.tierPricing as TierPricing).map(({ occupancy, setting }) => {
    const convertedAuto = toCurrency((auto.get(occupancy) ?? 0) + params.flightTotal);
    const final = finalTierTotal(convertedAuto, setting, params.decimals);
    return {
      label: occupancy,
      total: Math.max(
        0,
        roundToDecimals(final + includedFor(occupancy) - params.discount, params.decimals),
      ),
    };
  });

  const addOns: PackagePrintAddOn[] = (params.addOns ?? []).map((addOn) => ({
    label: addOn.label ?? "",
    amount: roundToDecimals(addOn.amount ?? 0, params.decimals),
    appliesToTier: (addOn.appliesToTier as "Triple" | "Double" | null) ?? null,
    included: includedLabels.includes(addOn.label ?? ""),
  }));

  return { tierPrices, addOns };
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
   * A negotiated discount taken off every printed price, in the package's own
   * currency. Internal, like a quotation's - only the reduced figures reach
   * the page, never the amount.
   */
  discount?: number;
  /**
   * Which of the package's add-on charges this print includes, by label.
   * Every add-on still prints - as an available extra - but only these get
   * marked included and priced into the tier totals. Omitted or empty means
   * none are included.
   */
  includedAddOns?: string[];
  /** The staff member who printed it, shown in the footer. */
  generatedBy?: string;
}

export async function buildPackagePdfBundle(
  id: string,
  options: PackagePrintOptions = {},
): Promise<{
  doc: Awaited<ReturnType<typeof buildQuotationDocument>>;
  tierPrices: PackageTierPrice[];
  addOns: PackagePrintAddOn[];
  name: string;
}> {
  const pkg = await getPackage(id);
  if (!pkg) throw new PackageError("Package not found.");

  const guestName = options.guest?.name?.trim() ?? "";
  const guest = { name: guestName, pax: Math.max(1, options.guest?.pax ?? 1) };
  // Not rounded here - it is in the chosen currency, which may have decimals
  // (cents), and the currency's own precision is not known until the doc
  // below resolves it. `calculateTotals` rounds it correctly for the
  // single-price path; the tier path rounds it explicitly, same as that.
  const discount = Math.max(0, options.discount ?? 0);

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
    // The package carries its own currency - not a print-time choice. The
    // print discount is in that same currency, like a quotation's.
    currencyCode: pkg.currencyCode ?? "PKR",
    discount,
  };

  // A package has no reference number, but it does carry who printed it, for
  // the footer. The customer and money still stay off the stored template.
  // This also resolves today's rate for the package's currency - a package
  // re-prices live, so nothing about this is frozen the way a quotation's is.
  const doc = await buildQuotationDocument(
    input,
    { userId: "", name: options.generatedBy ?? "", role: "admin" },
    "",
  );
  // The flight fare is the same across tiers, so it sits on every one.
  const flightTotal = doc.flight?.total ?? 0;

  const { tierPrices, addOns } = await priceTiersAndAddOns({
    season: pkg.season,
    stays,
    tierPricing: pkg.tierPricing as TierPricing,
    addOns: pkg.addOns,
    includedAddOns: options.includedAddOns,
    flightTotal,
    exchangeRate: doc.exchangeRate,
    decimals: doc.currency.decimals,
    discount,
  });

  return { doc, tierPrices, addOns, name: pkg.name };
}

/**
 * Same brochure as `buildPackagePdfBundle`, but for a package still being
 * built - there is no id to load yet, so it prices straight from the draft
 * the Save button would send. Mirrors how a quotation's own live preview
 * prices an unsaved `QuotationInput` rather than a stored document.
 *
 * No customer, discount or add-on is selected for a preview - it shows the
 * brochure exactly as a plain, undiscounted print would.
 */
export async function previewPackagePdfBundle(input: PackageInput): Promise<{
  doc: Awaited<ReturnType<typeof buildQuotationDocument>>;
  tierPrices: PackageTierPrice[];
  addOns: PackagePrintAddOn[];
}> {
  await assertValidItinerary(input);

  const quotationInput: QuotationInput = {
    season: input.season,
    guest: { name: "", pax: 1 },
    date: new Date(),
    validUntil: null,
    packageTitle: input.packageTitle ?? "",
    packageCategory: input.packageCategory ?? "",
    withoutMina: input.withoutMina ?? false,
    qurbaniIncluded: input.qurbaniIncluded ?? true,
    stays: input.stays,
    flight: packageFlight(input.flight),
    minaServiceIds: (input.minaServiceIds ?? []).map(String),
    arafatServiceIds: (input.arafatServiceIds ?? []).map(String),
    includeIds: (input.includeIds ?? []).map(String),
    requirementIds: (input.requirementIds ?? []).map(String),
    termIds: (input.termIds ?? []).map(String),
    includesNote: input.includesNote ?? "",
    remarks: input.remarks ?? "",
    currencyCode: input.currencyCode || "PKR",
    discount: 0,
  };

  const doc = await buildQuotationDocument(
    quotationInput,
    { userId: "", name: "", role: "admin" },
    "",
  );
  const flightTotal = doc.flight?.total ?? 0;

  const { tierPrices, addOns } = await priceTiersAndAddOns({
    season: input.season,
    stays: input.stays,
    tierPricing: input.tierPricing as TierPricing,
    addOns: input.addOns,
    includedAddOns: [],
    flightTotal,
    exchangeRate: doc.exchangeRate,
    decimals: doc.currency.decimals,
    discount: 0,
  });

  return { doc, tierPrices, addOns };
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
