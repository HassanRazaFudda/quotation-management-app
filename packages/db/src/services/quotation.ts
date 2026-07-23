/**
 * Building and storing quotations.
 *
 * The browser prices a quotation live so staff see totals as they type, but
 * nothing it sends is trusted: this module re-runs the same validation and the
 * same pricing from `@junaidi/shared` against the config in the database, and
 * saves what *it* calculated. A tampered or stale client cannot change a price.
 *
 * Every name, label and rate is copied onto the document. A quotation is a
 * thing already sent to a customer; renaming a hotel next month must not
 * silently rewrite it.
 */

import {
  calculateTotals,
  errorsOnly,
  formatPrice,
  hasErrors,
  makePricingContext,
  makeValidationContext,
  priceFlights,
  priceStays,
  resolveBlocks,
  roomLabel,
  validateItinerary,
  type FlightSelection,
  type PricedFlights,
  type PricedStay,
  type ResolvedBlock,
  type StayInput,
} from "@junaidi/shared";

import { nextSequence } from "../models/counter";
import { QuotationModel } from "../models/quotation";
import { getConfigBundle } from "./config";

export class QuotationError extends Error {
  constructor(
    message: string,
    readonly issues: string[] = [],
  ) {
    super(message);
    this.name = "QuotationError";
  }
}

export interface QuotationAuthor {
  userId: string;
  name: string;
  role: "admin" | "staff";
}

export interface QuotationInput {
  season: string;
  guest: { name: string; pax: number };
  date: Date | string;
  validUntil?: Date | string | null;
  packageTitle?: string;
  withoutMina?: boolean;
  /** Qurbani is part of the package unless the staff turn it off. */
  qurbaniIncluded?: boolean;
  packageCategory?: string;
  stays: StayInput[];
  /** Air travel; omitted or `included: false` means the guest arranges it. */
  flight?: FlightSelection;

  /** Ids from the `services` collection; resolved to labels on save. */
  minaServiceIds?: string[];
  arafatServiceIds?: string[];
  includeIds?: string[];
  requirementIds?: string[];
  termIds?: string[];

  includesNote?: string;
  remarks?: string;

  /** Internal only. Reported to the admin, never printed. */
  discount?: number;
  discountNote?: string;
  manualTotal?: number | null;
  status?: "draft" | "sent" | "confirmed" | "expired";
}

// --------------------------------------------------------------- numbering

export async function nextQuotationNumber(season: string): Promise<string> {
  const sequence = await nextSequence(`quotation:${season}`);
  return `HQ-${season}-${String(sequence).padStart(4, "0")}`;
}

// ------------------------------------------------------------ calculation

export interface PricedQuotation {
  stays: Array<PricedStay & { block: ResolvedBlock }>;
  flights: PricedFlights;
  totalNights: number;
  subtotal: number;
  discount: number;
  finalTotal: number;
  manualOverride: boolean;
  warnings: string[];
}

/**
 * Validate and price an itinerary against the stored configuration.
 * Used both by `POST /calculate` (live preview) and on save.
 */
export async function priceQuotation(input: QuotationInput): Promise<PricedQuotation> {
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
    throw new QuotationError(
      "This itinerary cannot be saved yet.",
      errorsOnly(issues).map((issue) => issue.message),
    );
  }

  const pricing = makePricingContext({
    blocks,
    accommodations: bundle.accommodations,
    locations: bundle.locations,
    rates: bundle.rates,
  });

  const priced = priceStays(input.stays, pricing);
  const flights = priceFlights(input.flight, bundle.flights);

  if (flights.issues.length > 0) {
    throw new QuotationError("The flight selection is incomplete.", flights.issues);
  }

  const totals = calculateTotals({
    stays: priced,
    flightTotal: flights.total,
    discount: input.discount,
    manualTotal: input.manualTotal,
  });

  const blockById = new Map(blocks.map((block) => [block.id, block]));

  return {
    stays: priced.map((stay) => ({ ...stay, block: blockById.get(stay.blockId)! })),
    flights,
    ...totals,
    warnings: issues.map((issue) => issue.message),
  };
}

// ------------------------------------------------------------------- save

/**
 * Turn validated input into the full denormalised document (names, labels and
 * rate snapshots resolved) without saving it. `createQuotation` persists the
 * result; the preview endpoint renders it straight to a PDF.
 */
export async function buildQuotationDocument(
  input: QuotationInput,
  author: QuotationAuthor,
  quotationId: string,
) {
  const bundle = await getConfigBundle(input.season);
  const priced = await priceQuotation(input);

  const locationById = new Map(bundle.locations.map((l) => [l.id, l]));
  const accommodationById = new Map(bundle.accommodations.map((a) => [a.id, a]));
  const mealById = new Map(bundle.meals.map((m) => [m.id, m]));
  const noteById = new Map(bundle.mealNotes.map((n) => [n.id, n]));
  const serviceById = new Map(bundle.services.map((s) => [s.id, s]));

  const labels = (ids: string[] | undefined): string[] =>
    (ids ?? [])
      .map((id) => serviceById.get(id)?.label)
      .filter((label): label is string => Boolean(label));

  const stays = priced.stays.map((stay) => {
    const accommodation = accommodationById.get(stay.accommodationId)!;
    const location = locationById.get(accommodation.locationId)!;

    return {
      blockId: stay.blockId,
      locationId: location.id,
      accommodationId: accommodation.id,

      blockLabelHijri: stay.block.label,
      blockLabelGregorian: stay.block.gregorianLabel ?? "",
      blockStartGregorian: stay.block.startGregorian ?? "",
      blockEndGregorian: stay.block.endGregorian ?? "",
      locationName: location.name,
      locationType: location.type,
      accommodationName: accommodation.name,
      minaTier: accommodation.minaTier ?? null,
      bedsPerTent: accommodation.bedsPerTent ?? null,
      roomType: stay.roomType ?? null,
      occupancy: stay.occupancy ?? null,
      sharingWord: stay.sharingWord ?? null,
      // Frozen at save time so the wording on a sent quotation never changes.
      roomLabel: roomLabel(stay),
      meal: stay.mealId ? (mealById.get(stay.mealId)?.label ?? "") : "",
      mealNote: stay.mealNoteId ? (noteById.get(stay.mealNoteId)?.label ?? "") : "",

      nights: stay.nights,
      rateSnapshot: stay.rateSnapshot,
      lineTotal: stay.lineTotal,
    };
  });

  return {
    quotationId,
    season: input.season,
    status: input.status ?? "draft",
    guest: { name: input.guest.name.trim(), pax: input.guest.pax },
    date: new Date(input.date),
    validUntil: input.validUntil ? new Date(input.validUntil) : null,
    packageTitle: input.packageTitle ?? "",
    packageCategory: input.packageCategory ?? "",
    withoutMina: input.withoutMina ?? false,
    qurbaniIncluded: input.qurbaniIncluded ?? true,

    stays,

    flight: {
      included: priced.flights.included,
      // A round-trip always carries a return.
      returnRequired: input.flight?.roundTripId ? true : (input.flight?.returnRequired ?? true),
      outbound: priced.flights.outbound,
      inbound: priced.flights.inbound,
      total: priced.flights.total,
    },

    minaServices: labels(input.minaServiceIds),
    arafatServices: labels(input.arafatServiceIds),
    includes: labels(input.includeIds),
    requirements: labels(input.requirementIds),
    terms: labels(input.termIds),
    includesNote: input.includesNote ?? "",
    remarks: input.remarks ?? "",

    totalNights: priced.totalNights,
    subtotal: priced.subtotal,
    discount: priced.discount,
    discountNote: input.discountNote ?? "",
    finalTotal: priced.finalTotal,
    manualOverride: priced.manualOverride,

    createdBy: author.userId,
    createdByName: author.name,
  };
}

export async function createQuotation(
  input: QuotationInput,
  author: QuotationAuthor,
) {
  const quotationId = await nextQuotationNumber(input.season);
  const doc = await buildQuotationDocument(input, author, quotationId);
  return QuotationModel.create(doc);
}

export async function updateQuotation(
  id: string,
  input: QuotationInput,
  author: QuotationAuthor,
) {
  const existing = await QuotationModel.findById(id);
  if (!existing) throw new QuotationError("Quotation not found.");

  if (author.role !== "admin" && String(existing.createdBy) !== author.userId) {
    throw new QuotationError("You can only edit your own quotations.");
  }

  const doc = await buildQuotationDocument(input, author, existing.quotationId);

  // The author and the number stay with the original.
  return QuotationModel.findByIdAndUpdate(
    id,
    {
      $set: {
        ...doc,
        createdBy: existing.createdBy,
        createdByName: existing.createdByName,
      },
    },
    { returnDocument: "after" },
  );
}

/**
 * Move a quotation to a new status.
 *
 * Confirming a booking demands an HB (Hajj Booking) number, and that number
 * must be unique - it is the reference the whole booking is tracked by, so the
 * same one cannot sit on two quotations. Every other transition is a plain
 * status change.
 */
export async function changeQuotationStatus(
  id: string,
  input: { status: "draft" | "sent" | "confirmed" | "expired"; hbNumber?: string },
  author: QuotationAuthor,
) {
  const existing = await QuotationModel.findById(id);
  if (!existing) throw new QuotationError("Quotation not found.");

  if (author.role !== "admin" && String(existing.createdBy) !== author.userId) {
    throw new QuotationError("You can only change your own quotations.");
  }

  if (input.status === "confirmed") {
    const hb = (input.hbNumber ?? "").trim();
    if (!hb) {
      throw new QuotationError("An HB number is required to confirm this booking.");
    }

    // No other booking may already carry this number.
    const clash = await QuotationModel.findOne({
      hbNumber: hb,
      _id: { $ne: existing._id },
    }).lean();
    if (clash) {
      throw new QuotationError(
        `HB number "${hb}" is already used on ${clash.quotationId}.`,
      );
    }

    existing.hbNumber = hb;
  }

  existing.status = input.status;

  try {
    await existing.save();
  } catch (error) {
    // The unique index is the last line of defence against a race.
    if (error instanceof Error && "code" in error && (error as { code: number }).code === 11000) {
      throw new QuotationError(
        `HB number "${(input.hbNumber ?? "").trim()}" is already used on another booking.`,
      );
    }
    throw error;
  }

  return existing;
}

/**
 * Most quotations are a small variation on a previous one, so duplication is
 * the single biggest time-saver in the app. The copy gets a fresh number,
 * today's date, draft status, and belongs to whoever duplicated it.
 */
export async function duplicateQuotation(id: string, author: QuotationAuthor) {
  const source = await QuotationModel.findById(id).lean();
  if (!source) throw new QuotationError("Quotation not found.");

  const quotationId = await nextQuotationNumber(source.season);
  // Drop the HB number too: a copy is a fresh draft, not the same booking.
  const { _id, createdAt, updatedAt, hbNumber, ...rest } = source as Record<string, unknown>;

  return QuotationModel.create({
    ...rest,
    quotationId,
    status: "draft",
    hbNumber: "",
    date: new Date(),
    createdBy: author.userId,
    createdByName: author.name,
  });
}

// ------------------------------------------------------------------ reads

export interface QuotationFilter {
  season?: string;
  status?: string;
  search?: string;
  /** Staff only ever see their own. */
  createdBy?: string;
  page?: number;
  pageSize?: number;
}

export async function listQuotations(filter: QuotationFilter) {
  const page = Math.max(1, filter.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, filter.pageSize ?? 20));

  const query: Record<string, unknown> = {};
  if (filter.season) query.season = filter.season;
  if (filter.status) query.status = filter.status;
  if (filter.createdBy) query.createdBy = filter.createdBy;
  if (filter.search?.trim()) {
    const pattern = new RegExp(escapeRegex(filter.search.trim()), "i");
    query.$or = [{ quotationId: pattern }, { "guest.name": pattern }];
  }

  const [items, total] = await Promise.all([
    QuotationModel.find(query)
      .sort({ createdAt: -1 })
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .lean(),
    QuotationModel.countDocuments(query),
  ]);

  return { items, total, page, pageSize, pages: Math.ceil(total / pageSize) };
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export async function getQuotation(id: string) {
  return QuotationModel.findById(id).lean();
}

// -------------------------------------------------------- admin reporting

export interface StaffReportRow {
  userId: string;
  name: string;
  quotations: number;
  totalQuoted: number;
  discountGiven: number;
}

/** Who produced how much, and how much they discounted away. Admin only. */
export async function staffReport(range: {
  from?: Date;
  to?: Date;
  season?: string;
}): Promise<StaffReportRow[]> {
  const match: Record<string, unknown> = {};
  if (range.season) match.season = range.season;
  if (range.from || range.to) {
    match.createdAt = {
      ...(range.from ? { $gte: range.from } : {}),
      ...(range.to ? { $lte: range.to } : {}),
    };
  }

  const rows = await QuotationModel.aggregate([
    { $match: match },
    {
      $group: {
        _id: "$createdBy",
        name: { $last: "$createdByName" },
        quotations: { $sum: 1 },
        totalQuoted: { $sum: "$finalTotal" },
        discountGiven: { $sum: "$discount" },
      },
    },
    { $sort: { quotations: -1 } },
  ]);

  return rows.map((row) => ({
    userId: String(row._id),
    name: row.name ?? "",
    quotations: row.quotations,
    totalQuoted: row.totalQuoted,
    discountGiven: row.discountGiven,
  }));
}

export { formatPrice };
