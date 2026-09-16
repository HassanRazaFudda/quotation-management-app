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
  BASE_CURRENCY,
  calculateTotals,
  errorsOnly,
  formatPrice,
  hasErrors,
  hijriIndex,
  isUnchangedSelection,
  makePricingContext,
  nestedHajjBlocks,
  makeValidationContext,
  minaCategoryLabel,
  priceFlights,
  priceStays,
  resolveBlocks,
  roomLabel,
  validateItinerary,
  type BaselineStay,
  type FlightSelection,
  type PricedFlights,
  type PricedStay,
  type ResolvedBlock,
  type StayInput,
} from "@junaidi/shared";

import { Types, type PipelineStage } from "mongoose";

import { nextSequence } from "../models/counter";
import { QuotationModel } from "../models/quotation";
import { UserModel } from "../models/user";
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

  /** The currency to price in; resolved against config for its frozen rate. */
  currencyCode?: string;
  /** Internal only. Reported to the admin, never printed. In the currency. */
  discount?: number;
  discountNote?: string;
  /** Signed rounding adjustment on the net. Internal only. In the currency. */
  roundOff?: number;
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
  roundOff: number;
  finalTotal: number;
  manualOverride: boolean;
  /** The frozen currency and its rate (PKR per unit) this quote was priced at. */
  currency: { code: string; symbol: string; decimals: number };
  exchangeRate: number;
  warnings: string[];
}

/**
 * Validate and price an itinerary against the stored configuration.
 * Used both by `POST /calculate` (live preview) and on save.
 *
 * `baselineStays`, when given, is what this quotation already has saved (same
 * index = same row). A row identical to its baseline is validated as it stood
 * when it was chosen, not against today's inventory (see `validateItinerary`),
 * and keeps the rate it was already quoted at rather than picking up a rate
 * change made since - the same "never silently rewrite a saved quotation"
 * rule this module's header describes, just applied to editing instead of
 * just to renaming. A row that is new, or that the caller has changed, is
 * priced fresh either way. Only `updateQuotation` has a baseline to pass;
 * creating a quotation, the `/calculate` preview, and an explicit "refresh to
 * today's rates" save all price every row fresh.
 */
export async function priceQuotation(
  input: QuotationInput,
  baselineStays?: BaselineStay[],
): Promise<PricedQuotation> {
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

  const issues = validateItinerary(input.stays, validation, baselineStays);
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

  const pax = Math.max(1, input.guest.pax);
  const heads = Math.max(1, Math.round(pax));
  const freshlyPriced = priceStays(input.stays, pricing, pax);

  // Freeze the *rate* back to what it already was for a row that has not
  // changed - that is the figure an admin's later config edit must not
  // silently rewrite. The party size is not part of that protection: `pax`
  // sits on the quotation, not the row, so it never fails
  // `isUnchangedSelection` and must still scale the row's group total, or a
  // pax edit alone would divide a stale, pre-edit group total by the new
  // headcount and print a per-person figure that matches neither. Skipped for
  // a genuine room mix (rare): the mix's own per-room figures cannot be
  // reconstructed from the saved snapshot, only the stay-level total, so a
  // mixed row is always priced fresh to keep the two consistent with
  // each other.
  const priced = freshlyPriced.map((stay, index) => {
    const baseline = baselineStays?.[index];
    if (
      baseline &&
      (baseline.rooms?.length ?? 0) <= 1 &&
      isUnchangedSelection(input.stays[index]!, baseline)
    ) {
      return {
        ...stay,
        nights: baseline.nights,
        rateSnapshot: baseline.rateSnapshot,
        lineTotal: baseline.rateSnapshot,
        groupTotal: baseline.rateSnapshot * heads,
      };
    }
    return stay;
  });

  const flights = priceFlights(input.flight, bundle.flights);

  if (flights.issues.length > 0) {
    throw new QuotationError("The flight selection is incomplete.", flights.issues);
  }

  // Resolve the quotation's currency against the current config, freezing its
  // rate. PKR (or an unknown/disabled code) falls back to the base.
  const wanted = (input.currencyCode ?? "PKR").toUpperCase();
  const picked = bundle.currencies.find((c) => c.enabled && c.code.toUpperCase() === wanted);
  const currency = picked ?? BASE_CURRENCY;
  const exchangeRate = currency.rate > 0 ? currency.rate : 1;

  const totals = calculateTotals({
    stays: priced,
    flightTotal: flights.total,
    discount: input.discount,
    roundOff: input.roundOff,
    manualTotal: input.manualTotal,
    pax,
    exchangeRate,
    decimals: currency.decimals,
  });

  const blockById = new Map(blocks.map((block) => [block.id, block]));

  return {
    stays: priced.map((stay) => ({ ...stay, block: blockById.get(stay.blockId)! })),
    flights,
    ...totals,
    currency: { code: currency.code, symbol: currency.symbol, decimals: currency.decimals },
    exchangeRate,
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
  baselineStays?: BaselineStay[],
) {
  const bundle = await getConfigBundle(input.season);
  const priced = await priceQuotation(input, baselineStays);

  const locationById = new Map(bundle.locations.map((l) => [l.id, l]));
  const accommodationById = new Map(bundle.accommodations.map((a) => [a.id, a]));
  const mealById = new Map(bundle.meals.map((m) => [m.id, m]));
  const noteById = new Map(bundle.mealNotes.map((n) => [n.id, n]));
  const serviceById = new Map(bundle.services.map((s) => [s.id, s]));

  // Resolve to the label *and* its styling, both frozen onto the quotation so a
  // later colour change never rewrites a document already sent.
  const styledLines = (ids: string[] | undefined) =>
    (ids ?? [])
      .map((id) => serviceById.get(id))
      .filter((service): service is NonNullable<typeof service> => Boolean(service))
      .map((service) => ({
        text: service.label,
        color: service.color ?? "",
        bold: service.bold ?? false,
      }));

  // Which stay swallows the Hajj days, so its row can say so.
  const { covering } = nestedHajjBlocks(priced.stays.map((stay) => stay.block));

  /*
   * Order the rows by date rather than by the order they were typed. A Hajj row
   * added last still belongs directly under the stay that spans it, and the
   * travel dates below are read off the ends of this list. Where two stays
   * start on the same day the longer one leads, so the spanning stay comes
   * before the Hajj row nested in it.
   */
  const ordered = [...priced.stays].sort((a, b) => {
    const start = hijriIndex(a.block.startHijri) - hijriIndex(b.block.startHijri);
    if (start !== 0) return start;
    return hijriIndex(b.block.endHijri) - hijriIndex(a.block.endHijri);
  });

  const stays = ordered.map((stay) => {
    const accommodation = accommodationById.get(stay.accommodationId)!;
    const location = locationById.get(accommodation.locationId)!;

    // A genuine mix (two or more room entries) is frozen for the PDF; an
    // ordinary single-room stay stores nothing extra and reads as it did.
    // Each entry is resolved against the config so its name, Mina tier and
    // printed label are authoritative, not whatever the form happened to send
    // - a Mina split only carries the tent id, so the label is derived here.
    const roomsSnapshot =
      stay.rooms.length > 1
        ? stay.rooms.map((room) => {
            const roomAcc = accommodationById.get(room.accommodationId);
            const isMinaEntry = location.type === "mina";
            return {
              accommodationId: room.accommodationId,
              accommodationName: roomAcc?.name ?? room.accommodationName ?? "",
              minaTier: roomAcc?.minaTier ?? null,
              withoutMina: roomAcc?.withoutMina ?? false,
              roomType: room.roomType ?? null,
              occupancy: room.occupancy ?? null,
              sharingWord: room.sharingWord ?? null,
              withoutBed: room.withoutBed ?? false,
              // Mina entries name their tier ("Standard", "Without Mina");
              // hotel/Aziziya entries name their room size.
              roomLabel: isMinaEntry
                ? minaCategoryLabel({
                    minaTier: roomAcc?.minaTier,
                    withoutMina: roomAcc?.withoutMina,
                    accommodationName: roomAcc?.name,
                  })
                : roomLabel(room),
              headcount: room.headcount,
            };
          })
        : [];

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
      withoutMina: accommodation.withoutMina ?? false,
      bedsPerTent: accommodation.bedsPerTent ?? null,
      roomType: stay.roomType ?? null,
      occupancy: stay.occupancy ?? null,
      sharingWord: stay.sharingWord ?? null,
      // Frozen at save time so the wording on a sent quotation never changes.
      roomLabel: roomLabel(stay),
      meal: stay.mealId ? (mealById.get(stay.mealId)?.label ?? "") : "",
      mealId: stay.mealId ?? null,
      mealNote: stay.mealNoteId ? (noteById.get(stay.mealNoteId)?.label ?? "") : "",
      mealNoteId: stay.mealNoteId ?? null,
      coversHajj: covering.has(stay.blockId),

      rooms: roomsSnapshot,

      nights: stay.nights,
      rateSnapshot: stay.rateSnapshot,
      lineTotal: stay.lineTotal,
      groupTotal: stay.groupTotal,
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

    minaServices: styledLines(input.minaServiceIds),
    arafatServices: styledLines(input.arafatServiceIds),
    includes: styledLines(input.includeIds),
    requirements: styledLines(input.requirementIds),
    terms: styledLines(input.termIds),
    includesNote: input.includesNote ?? "",
    remarks: input.remarks ?? "",

    // Kept for restoring the form when editing or duplicating.
    minaServiceIds: input.minaServiceIds ?? [],
    arafatServiceIds: input.arafatServiceIds ?? [],
    includeIds: input.includeIds ?? [],
    requirementIds: input.requirementIds ?? [],
    termIds: input.termIds ?? [],

    totalNights: priced.totalNights,
    currency: priced.currency,
    exchangeRate: priced.exchangeRate,
    subtotal: priced.subtotal,
    discount: priced.discount,
    discountNote: input.discountNote ?? "",
    roundOff: priced.roundOff,
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

/**
 * Rebuild a saved stay as the `BaselineStay` shape validation and pricing
 * compare against, so an edit can tell "still exactly what was chosen, at the
 * rate it was chosen at" from "new or changed". Only the fields
 * `isUnchangedSelection` looks at, plus the frozen numbers, matter here.
 */
function toBaselineStayInput(stay: {
  blockId: unknown;
  locationId: unknown;
  accommodationId: unknown;
  roomType?: string | null;
  occupancy?: string | null;
  sharingWord?: string | null;
  mealId?: unknown;
  mealNoteId?: unknown;
  rooms?: Array<{
    accommodationId: unknown;
    roomType?: string | null;
    occupancy?: string | null;
    sharingWord?: string | null;
    withoutBed?: boolean;
    headcount: number;
  }>;
  nights: number;
  rateSnapshot: number;
  lineTotal: number;
  groupTotal: number;
}): BaselineStay {
  return {
    blockId: String(stay.blockId),
    locationId: String(stay.locationId),
    accommodationId: String(stay.accommodationId),
    roomType: (stay.roomType ?? null) as StayInput["roomType"],
    occupancy: (stay.occupancy ?? null) as StayInput["occupancy"],
    sharingWord: (stay.sharingWord ?? null) as StayInput["sharingWord"],
    mealId: stay.mealId ? String(stay.mealId) : null,
    mealNoteId: stay.mealNoteId ? String(stay.mealNoteId) : null,
    rooms: (stay.rooms ?? []).map((room) => ({
      accommodationId: String(room.accommodationId),
      roomType: (room.roomType ?? null) as StayInput["roomType"],
      occupancy: (room.occupancy ?? null) as StayInput["occupancy"],
      sharingWord: (room.sharingWord ?? null) as StayInput["sharingWord"],
      withoutBed: room.withoutBed ?? false,
      headcount: room.headcount,
    })),
    nights: stay.nights,
    rateSnapshot: stay.rateSnapshot,
    lineTotal: stay.lineTotal,
    groupTotal: stay.groupTotal,
  };
}

/**
 * The baseline an in-progress edit should be judged against: what this
 * quotation already has saved, row for row. `undefined` for a brand-new
 * quotation (no id yet) or an id that no longer resolves - every row is then
 * checked fresh, same as `updateQuotation` falls back to.
 *
 * Used by the live PDF preview so an untouched row is never flagged just
 * because the admin has since narrowed today's inventory - exactly the
 * leniency an actual save already gets.
 */
export async function getQuotationBaseline(
  id: string | null | undefined,
): Promise<BaselineStay[] | undefined> {
  if (!id || !Types.ObjectId.isValid(id)) return undefined;
  const existing = await QuotationModel.findById(id).lean();
  return existing ? existing.stays.map((stay) => toBaselineStayInput(stay)) : undefined;
}

export async function updateQuotation(
  id: string,
  input: QuotationInput,
  author: QuotationAuthor,
  options?: {
    /**
     * Staff asked to sync this quotation to today's rates and inventory
     * instead of the usual edit behaviour - price and validate every row
     * fresh, exactly as a new quotation would be, dropping the baseline that
     * would otherwise keep untouched rows at their old rate.
     */
    refreshRates?: boolean;
  },
) {
  const existing = await QuotationModel.findById(id);
  if (!existing) throw new QuotationError("Quotation not found.");

  if (author.role !== "admin" && String(existing.createdBy) !== author.userId) {
    throw new QuotationError("You can only edit your own quotations.");
  }

  // A confirmed booking has already been sold at this price - possibly with
  // payments already taken against it - so it is never re-priced, refresh or
  // not. It stays fully editable; refreshing to today's rates is simply not
  // offered on it.
  if (options?.refreshRates && existing.status === "confirmed") {
    throw new QuotationError(
      "A confirmed booking's rate cannot be refreshed - it has already been sold at this price.",
    );
  }

  // What's already saved, row for row - a row the incoming input still
  // matches exactly is left alone by today's inventory checks and keeps its
  // old rate; see `isUnchangedSelection` in @junaidi/shared. Skipped entirely
  // on an explicit refresh.
  const baselineStays = options?.refreshRates
    ? undefined
    : existing.stays.map((stay) => toBaselineStayInput(stay));
  const doc = await buildQuotationDocument(input, author, existing.quotationId, baselineStays);

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
 * Confirmation's one extra rule: every stay must be bookable *today*, not just
 * when it was first chosen. Unlike a save, this never gets a baseline to
 * exempt an untouched row - the whole point is to catch inventory the admin
 * has since narrowed or removed.
 */
async function assertCurrentlyBookable(
  season: string,
  stays: StayInput[],
  withoutMina: boolean,
): Promise<void> {
  const bundle = await getConfigBundle(season);
  const blocks = resolveBlocks(bundle.blocks, bundle.calendar);

  const validation = makeValidationContext({
    blocks,
    locations: bundle.locations,
    accommodations: bundle.accommodations,
    meals: bundle.meals,
    mealNotes: bundle.mealNotes,
    withoutMina,
  });

  const issues = errorsOnly(validateItinerary(stays, validation));
  if (issues.length === 0) return;

  throw new QuotationError(
    "This booking can no longer be confirmed as it stands - please change the highlighted selection first.",
    issues.map((issue) => issue.message),
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
  input: {
    status: "draft" | "sent" | "confirmed" | "expired";
    hbNumber?: string;
    /** The primary staff handling the booking: a system user, or a typed name. */
    assignedStaffUserId?: string | null;
    assignedStaffName?: string;
  },
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

    // Confirming asserts this booking is sellable *today* - unlike an
    // ordinary save, every stay is checked fresh against current inventory,
    // even ones untouched since the quotation was first written. Editing and
    // saving stay unblocked either way; only confirmation is gated here.
    await assertCurrentlyBookable(
      existing.season,
      existing.stays.map((stay) => toBaselineStayInput(stay)),
      existing.withoutMina,
    );

    existing.hbNumber = hb;

    // The assigned staff: a picked system user (name snapshotted), or a typed
    // name. Only touched on confirmation, and only when something is provided.
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

/**
 * Delete a quotation outright.
 *
 * A quotation is not shared config - it is one document - so this is a real
 * delete, not a soft one. Staff may remove their own; an admin may remove
 * anyone's. Deleting a confirmed booking frees its HB number for reuse.
 */
export async function deleteQuotation(id: string, author: QuotationAuthor) {
  const existing = await QuotationModel.findById(id);
  if (!existing) throw new QuotationError("Quotation not found.");

  if (author.role !== "admin" && String(existing.createdBy) !== author.userId) {
    throw new QuotationError("You can only delete your own quotations.");
  }

  await existing.deleteOne();
  return { ok: true as const };
}

// ------------------------------------------------------------------ reads

/** How the list is ordered. Either date, either way round. */
export const QUOTATION_SORTS = ["created-desc", "created-asc", "date-desc", "date-asc"] as const;
export type QuotationSort = (typeof QUOTATION_SORTS)[number];

/** Optional banding of the list. */
export const QUOTATION_GROUPS = ["none", "staff", "status", "month"] as const;
export type QuotationGroup = (typeof QUOTATION_GROUPS)[number];

const SORT_SPECS: Record<QuotationSort, Record<string, 1 | -1>> = {
  "created-desc": { createdAt: -1 },
  "created-asc": { createdAt: 1 },
  "date-desc": { date: -1 },
  "date-asc": { date: 1 },
};

/** Status bands read in the order a booking actually moves through them. */
const STATUS_ORDER = ["draft", "sent", "confirmed", "expired"];

/** The heading the client draws for a row. Month sorts as it reads: "2026-07". */
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

export interface QuotationFilter {
  season?: string;
  status?: string;
  search?: string;
  /** Everyone reads everyone's work; this narrows the list to one author. */
  createdBy?: string;
  sort?: QuotationSort;
  groupBy?: QuotationGroup;
  page?: number;
  pageSize?: number;
}

/**
 * A page of quotations.
 *
 * The whole agency shares one list, so it carries the tools that make a shared
 * list usable: order by either date, and band by staff member, status or month.
 * Grouping works by *sorting* on the group key first, so a band is never
 * scattered across pages - the server stamps each row with the label of the
 * band it belongs to and the client draws a heading whenever the label changes.
 */
export async function listQuotations(filter: QuotationFilter) {
  const page = Math.max(1, filter.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, filter.pageSize ?? 20));
  const sort = SORT_SPECS[filter.sort ?? "created-desc"] ?? SORT_SPECS["created-desc"];
  const groupBy = filter.groupBy ?? "none";

  const query: Record<string, unknown> = {};
  if (filter.season) query.season = filter.season;
  if (filter.status) query.status = filter.status;
  // An aggregation gets no schema casting, so the author id is cast by hand.
  if (filter.createdBy && Types.ObjectId.isValid(filter.createdBy)) {
    query.createdBy = new Types.ObjectId(filter.createdBy);
  }
  if (filter.search?.trim()) {
    const pattern = new RegExp(escapeRegex(filter.search.trim()), "i");
    // A confirmed booking is often looked up by its HB number, so search it too.
    query.$or = [{ quotationId: pattern }, { "guest.name": pattern }, { hbNumber: pattern }];
  }

  const pipeline: PipelineStage[] = [{ $match: query }];

  if (groupBy !== "none") {
    pipeline.push({
      $addFields: { groupLabel: GROUP_LABEL[groupBy], groupSort: GROUP_SORT[groupBy] },
    });
  }

  pipeline.push(
    {
      $sort: {
        // Months follow the chosen direction; people and statuses read in their
        // own natural order whichever way the dates run.
        ...(groupBy === "none"
          ? {}
          : { groupSort: groupBy === "month" && !filter.sort?.endsWith("-asc") ? -1 : 1 }),
        ...sort,
        _id: -1, // a tiebreak, so paging never repeats or drops a row
      },
    },
    { $skip: (page - 1) * pageSize },
    { $limit: pageSize },
    { $project: { groupSort: 0 } },
  );

  const [items, total] = await Promise.all([
    QuotationModel.aggregate(pipeline),
    QuotationModel.countDocuments(query),
  ]);

  return { items, total, page, pageSize, pages: Math.ceil(total / pageSize) };
}

/**
 * Everyone who has produced a quotation, for the "whose work" filter. Names
 * come off the quotations themselves, so a staff member who has since left
 * still appears next to the work they did.
 */
export async function quotationAuthors(season?: string): Promise<Array<{ userId: string; name: string }>> {
  const match: Record<string, unknown> = {};
  if (season) match.season = season;

  const rows = await QuotationModel.aggregate([
    { $match: match },
    { $group: { _id: "$createdBy", name: { $last: "$createdByName" } } },
    { $sort: { name: 1 } },
  ]);

  return rows.map((row) => ({ userId: String(row._id), name: row.name ?? "" }));
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
