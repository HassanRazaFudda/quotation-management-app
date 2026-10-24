/**
 * Building and storing Umrah quotations.
 *
 * The browser prices a quotation live, but nothing it sends is trusted: this
 * module re-runs the same validation and pricing from `@junaidi/shared` and
 * saves what *it* calculated. Unlike Hajj there is no admin configuration to
 * read - every rate is on the quotation itself - so this file imports nothing
 * from the Hajj quotation or config modules.
 */

import {
  cleanUmrahLines,
  priceUmrahQuotation,
  type UmrahChargeInput,
  type UmrahFlightInput,
  type UmrahLegInput,
  type UmrahLineSetting,
  type UmrahPriceDisplay,
  type UmrahPricingMode,
  type UmrahStayInput,
  type UmrahTransportDisplay,
  type StyledLine,
} from "@junaidi/shared";
import { Types, type PipelineStage } from "mongoose";

import { nextSequence } from "../models/counter";
import { UmrahQuotationModel } from "../models/umrah-quotation";
import { UserModel } from "../models/user";

export class UmrahQuotationError extends Error {
  constructor(
    message: string,
    readonly issues: string[] = [],
  ) {
    super(message);
    this.name = "UmrahQuotationError";
  }
}

export interface UmrahAuthor {
  userId: string;
  name: string;
  role: "admin" | "staff";
}

export interface UmrahQuotationInput {
  guest: { name: string; pax: number; withoutBedPax: number; infants: number };
  date: Date | string;
  validUntil?: Date | string | null;
  packageTitle?: string;
  pricingMode: UmrahPricingMode;
  priceDisplay: UmrahPriceDisplay;
  transportDisplay: UmrahTransportDisplay;
  currency: { code: string; symbol: string; decimals: number };
  exchangeRates: Array<{ code: string; rate: number }>;
  stays: UmrahStayInput[];
  transportLegs: UmrahLegInput[];
  flight: UmrahFlightInput;
  charges: UmrahChargeInput[];
  lineSettings: UmrahLineSetting[];
  discountNote?: string;
  includes?: Array<string | StyledLine>;
  requirements?: Array<string | StyledLine>;
  terms?: Array<string | StyledLine>;
  remarks?: string;
}

// --------------------------------------------------------------- numbering

/** "UQ-2026-0001": the year of the quotation, then a running number within it. */
export async function nextUmrahQuotationNumber(year: string): Promise<string> {
  const sequence = await nextSequence(`umrah-quotation:${year}`);
  return `UQ-${year}-${String(sequence).padStart(4, "0")}`;
}

// ------------------------------------------------------------------- build

/**
 * Turn validated input into the full document, with every figure recalculated
 * here. Throws `UmrahQuotationError` carrying each problem when it cannot be
 * priced. Used by save and by the live PDF preview.
 */
export function buildUmrahQuotationDocument(
  input: UmrahQuotationInput,
  author: UmrahAuthor,
  quotationId: string,
) {
  const pricing = priceUmrahQuotation({
    mode: input.pricingMode,
    priceDisplay: input.priceDisplay,
    transportDisplay: input.transportDisplay,
    guest: input.guest,
    currency: input.currency,
    exchangeRates: input.exchangeRates,
    stays: input.stays,
    transportLegs: input.transportLegs,
    flight: input.flight,
    charges: input.charges,
    lineSettings: input.lineSettings,
  });

  if (pricing.hasErrors) {
    throw new UmrahQuotationError(
      "This quotation cannot be saved yet.",
      pricing.issues.filter((issue) => issue.severity === "error").map((issue) => issue.message),
    );
  }

  const date = new Date(input.date);
  const tiered = input.pricingMode === "tiered";
  const tierKeys = ["Quad", "Triple", "Double"];

  // Only the settings of lines that actually exist are kept; a line the mode
  // does not use must not linger from an earlier choice.
  const lineKeys = new Set(pricing.lines.map((line) => line.key as string));
  const lineSettings = input.lineSettings
    .filter((setting) => lineKeys.has(setting.key) || (tiered && tierKeys.includes(setting.key)))
    .map((setting) => ({
      key: setting.key,
      offered: setting.offered ?? true,
      discount: Math.max(0, setting.discount),
      roundOff: setting.roundOff,
      manualTotal: setting.manualTotal ?? null,
    }));

  return {
    quotationId,
    year: String(date.getUTCFullYear()),
    guest: {
      name: input.guest.name.trim(),
      pax: input.guest.pax,
      withoutBedPax: input.guest.withoutBedPax,
      infants: input.guest.infants,
    },
    date,
    validUntil: input.validUntil ? new Date(input.validUntil) : null,
    packageTitle: (input.packageTitle ?? "").trim(),

    pricingMode: input.pricingMode,
    priceDisplay: input.priceDisplay,
    transportDisplay: input.transportDisplay,

    currency: {
      code: input.currency.code.trim().toUpperCase(),
      symbol: input.currency.symbol.trim() || input.currency.code.trim().toUpperCase(),
      decimals: input.currency.decimals,
    },
    exchangeRates: input.exchangeRates.map((entry) => ({
      code: entry.code.trim().toUpperCase(),
      rate: entry.rate,
    })),

    stays: input.stays.map((stay, index) => ({
      city: stay.city.trim(),
      hotelName: stay.hotelName.trim(),
      distance: (stay.distance ?? "").trim(),
      checkIn: stay.checkIn,
      checkOut: stay.checkOut,
      nights: pricing.stays[index]!.nights,
      meal: (stay.meal ?? "").trim(),
      currencyCode: stay.currencyCode.trim().toUpperCase(),
      rateBasis: stay.rateBasis,
      // A mode keeps only the rates it uses, whatever the form sent.
      rooms: tiered ? [] : stay.rooms.map((line) => ({ ...line, roomType: line.roomType.trim() })),
      tierRates: tiered ? stay.tierRates : { Quad: null, Triple: null, Double: null },
      withoutBedRate: stay.withoutBedRate,
      cost: pricing.stays[index]!.cost,
    })),

    transportLegs: input.transportLegs.map((leg) => ({
      route: leg.route.trim(),
      isCustomRoute: leg.isCustomRoute ?? false,
      vehicle: leg.vehicle.trim(),
      cost: leg.cost,
      currencyCode: leg.currencyCode.trim().toUpperCase(),
    })),
    flight: {
      included: input.flight.included,
      airline: input.flight.airline.trim(),
      outbound: input.flight.outbound.trim(),
      inbound: input.flight.inbound.trim(),
      adultFare: input.flight.adultFare,
      infantFare: input.flight.infantFare,
      currencyCode: input.flight.currencyCode.trim().toUpperCase(),
    },
    charges: input.charges.map((charge) => ({
      label: charge.label.trim(),
      amount: charge.amount,
      currencyCode: charge.currencyCode.trim().toUpperCase(),
      basis: charge.basis,
    })),

    lineSettings,
    priceLines: pricing.lines.map((line) => ({ ...line })),

    totalNights: pricing.totalNights,
    transportTotal: pricing.transportTotal,
    grandTotal: pricing.grandTotal,
    finalTotal: pricing.finalTotal,
    discountNote: input.discountNote ?? "",

    includes: cleanUmrahLines(input.includes),
    requirements: cleanUmrahLines(input.requirements),
    terms: cleanUmrahLines(input.terms),
    remarks: input.remarks ?? "",

    createdBy: author.userId,
    createdByName: author.name,
  };
}

// -------------------------------------------------------------------- save

export async function createUmrahQuotation(input: UmrahQuotationInput, author: UmrahAuthor) {
  const year = String(new Date(input.date).getUTCFullYear());
  const quotationId = await nextUmrahQuotationNumber(year);
  const doc = buildUmrahQuotationDocument(input, author, quotationId);
  return UmrahQuotationModel.create(doc);
}

const asId = (value: string): Types.ObjectId | null =>
  Types.ObjectId.isValid(value) ? new Types.ObjectId(value) : null;

export async function updateUmrahQuotation(id: string, input: UmrahQuotationInput, author: UmrahAuthor) {
  const objectId = asId(id);
  const existing = objectId ? await UmrahQuotationModel.findById(objectId) : null;
  if (!existing) throw new UmrahQuotationError("Quotation not found.");

  if (author.role !== "admin" && String(existing.createdBy) !== author.userId) {
    throw new UmrahQuotationError("You can only edit your own quotations.");
  }

  // A booking that has been confirmed - and may have payments - needs one
  // total to be paid against, which a room-types quote does not have.
  if (existing.status === "confirmed" && input.pricingMode === "tiered") {
    throw new UmrahQuotationError(
      "A confirmed booking cannot show separate room-type prices. Choose Single or Family.",
    );
  }

  // The number, author, status and payments stay with the original.
  const doc = buildUmrahQuotationDocument(input, author, existing.quotationId);
  const { createdBy: _by, createdByName: _byName, quotationId: _number, year: _year, ...fields } = doc;

  return UmrahQuotationModel.findByIdAndUpdate(objectId, { $set: fields }, { returnDocument: "after" });
}

/**
 * Move a quotation to a new status.
 *
 * Confirming demands a booking number, unique among Umrah bookings, and a single
 * price to be paid against - so a room-types quote must be switched to Single or
 * Family first. Every other transition is a plain status change.
 */
export async function changeUmrahQuotationStatus(
  id: string,
  input: {
    status: "draft" | "sent" | "confirmed" | "expired";
    bookingRef?: string;
    assignedStaffUserId?: string | null;
    assignedStaffName?: string;
  },
  author: UmrahAuthor,
) {
  const objectId = asId(id);
  const existing = objectId ? await UmrahQuotationModel.findById(objectId) : null;
  if (!existing) throw new UmrahQuotationError("Quotation not found.");

  if (author.role !== "admin" && String(existing.createdBy) !== author.userId) {
    throw new UmrahQuotationError("You can only change your own quotations.");
  }

  if (input.status === "confirmed") {
    if (existing.pricingMode === "tiered") {
      throw new UmrahQuotationError(
        "A quotation with separate room-type prices cannot be confirmed. Edit it to Single or Family first.",
      );
    }

    const ref = (input.bookingRef ?? "").trim();
    if (!ref) throw new UmrahQuotationError("A booking number is required to confirm this booking.");

    const clash = await UmrahQuotationModel.findOne({ bookingRef: ref, _id: { $ne: existing._id } }).lean();
    if (clash) {
      throw new UmrahQuotationError(`Booking number "${ref}" is already used on ${clash.quotationId}.`);
    }

    existing.bookingRef = ref;

    if (input.assignedStaffUserId && Types.ObjectId.isValid(input.assignedStaffUserId)) {
      const user = await UserModel.findById(input.assignedStaffUserId).select("name").lean();
      existing.assignedStaff = {
        userId: new Types.ObjectId(input.assignedStaffUserId),
        name: (user as Record<string, any> | null)?.name ?? (input.assignedStaffName ?? "").trim(),
      };
    } else if ((input.assignedStaffName ?? "").trim()) {
      existing.assignedStaff = { userId: null, name: input.assignedStaffName!.trim() };
    }
  }

  existing.status = input.status;

  try {
    await existing.save();
  } catch (error) {
    // The unique index is the last line of defence against a race.
    if (error instanceof Error && "code" in error && (error as { code: number }).code === 11000) {
      throw new UmrahQuotationError(
        `Booking number "${(input.bookingRef ?? "").trim()}" is already used on another booking.`,
      );
    }
    throw error;
  }

  return existing;
}

export async function deleteUmrahQuotation(id: string, author: UmrahAuthor) {
  const objectId = asId(id);
  const existing = objectId ? await UmrahQuotationModel.findById(objectId) : null;
  if (!existing) throw new UmrahQuotationError("Quotation not found.");

  if (author.role !== "admin" && String(existing.createdBy) !== author.userId) {
    throw new UmrahQuotationError("You can only delete your own quotations.");
  }

  await existing.deleteOne();
  return { ok: true as const };
}

// ------------------------------------------------------------------- reads

export const UMRAH_QUOTATION_SORTS = ["created-desc", "created-asc", "date-desc", "date-asc"] as const;
export type UmrahQuotationSort = (typeof UMRAH_QUOTATION_SORTS)[number];

export const UMRAH_QUOTATION_GROUPS = ["none", "staff", "status", "month"] as const;
export type UmrahQuotationGroup = (typeof UMRAH_QUOTATION_GROUPS)[number];

const SORT_SPECS: Record<UmrahQuotationSort, Record<string, 1 | -1>> = {
  "created-desc": { createdAt: -1 },
  "created-asc": { createdAt: 1 },
  "date-desc": { date: -1 },
  "date-asc": { date: 1 },
};

const STATUS_ORDER = ["draft", "sent", "confirmed", "expired"];

const GROUP_LABEL = {
  staff: "$createdByName",
  status: "$status",
  month: { $dateToString: { format: "%Y-%m", date: "$date" } },
} as const;

const GROUP_SORT = {
  staff: { $toLower: "$createdByName" },
  status: { $indexOfArray: [STATUS_ORDER, "$status"] },
  month: { $dateToString: { format: "%Y-%m", date: "$date" } },
} as const;

export interface UmrahQuotationFilter {
  year?: string;
  status?: string;
  search?: string;
  createdBy?: string;
  sort?: UmrahQuotationSort;
  groupBy?: UmrahQuotationGroup;
  page?: number;
  pageSize?: number;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** A page of Umrah quotations, banded the same way the Hajj list is. */
export async function listUmrahQuotations(filter: UmrahQuotationFilter) {
  const page = Math.max(1, filter.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, filter.pageSize ?? 20));
  const sort = SORT_SPECS[filter.sort ?? "created-desc"] ?? SORT_SPECS["created-desc"];
  const groupBy = filter.groupBy ?? "none";

  const query: Record<string, unknown> = {};
  if (filter.year) query.year = filter.year;
  if (filter.status) query.status = filter.status;
  // An aggregation gets no schema casting, so the author id is cast by hand.
  if (filter.createdBy && Types.ObjectId.isValid(filter.createdBy)) {
    query.createdBy = new Types.ObjectId(filter.createdBy);
  }
  if (filter.search?.trim()) {
    const pattern = new RegExp(escapeRegex(filter.search.trim()), "i");
    query.$or = [{ quotationId: pattern }, { "guest.name": pattern }, { bookingRef: pattern }];
  }

  const pipeline: PipelineStage[] = [{ $match: query }];

  if (groupBy !== "none") {
    pipeline.push({ $addFields: { groupLabel: GROUP_LABEL[groupBy], groupSort: GROUP_SORT[groupBy] } });
  }

  pipeline.push(
    {
      $sort: {
        ...(groupBy === "none"
          ? {}
          : { groupSort: groupBy === "month" && !filter.sort?.endsWith("-asc") ? -1 : 1 }),
        ...sort,
        _id: -1,
      },
    },
    { $skip: (page - 1) * pageSize },
    { $limit: pageSize },
    { $project: { groupSort: 0 } },
  );

  const [items, total] = await Promise.all([
    UmrahQuotationModel.aggregate(pipeline),
    UmrahQuotationModel.countDocuments(query),
  ]);

  return { items, total, page, pageSize, pages: Math.ceil(total / pageSize) };
}

/** Everyone who has produced an Umrah quotation, for the "whose work" filter. */
export async function umrahQuotationAuthors(year?: string): Promise<Array<{ userId: string; name: string }>> {
  const match: Record<string, unknown> = {};
  if (year) match.year = year;

  const rows = await UmrahQuotationModel.aggregate([
    { $match: match },
    { $group: { _id: "$createdBy", name: { $last: "$createdByName" } } },
    { $sort: { name: 1 } },
  ]);

  return rows.map((row) => ({ userId: String(row._id), name: row.name ?? "" }));
}

/** One quotation, or null for an unknown or malformed id (never a CastError). */
export async function getUmrahQuotation(id: string) {
  const objectId = asId(id);
  return objectId ? UmrahQuotationModel.findById(objectId).lean() : null;
}
