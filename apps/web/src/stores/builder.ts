/**
 * The quotation being built.
 *
 * Every change recomputes totals and warnings locally (via @junaidi/shared) so
 * the form feels instant, and the server recalculates the same way on save -
 * the server is the authority on the price.
 */

import {
  applyNestedNights,
  buildPackageTitle,
  convertFromPkr,
  PACKAGE_TEMPLATE_SUFFIX,
  calculateTotals,
  makePricingContext,
  makeValidationContext,
  nestedHajjBlocks,
  priceFlights,
  priceStays,
  priceTiers,
  roundToDecimals,
  suggestHajjBlock,
  TIER_OCCUPANCIES,
  validateItinerary,
  type FlightSelection,
  type Issue,
  type StayInput,
  type TierOccupancy,
} from "@junaidi/shared";
import { create } from "zustand";

import type { useConfigStore } from "./config";

export interface BuilderStay extends StayInput {
  key: string; // stable React key, independent of the selected block
}

type ConfigSnapshot = ReturnType<typeof useConfigStore.getState>;

export interface BuilderState {
  quotationId: string | null; // set when editing an existing quotation

  packageCategory: string;
  /** Which Mina tent tier, or "" for a package without Mina. */
  minaAccommodationId: string;
  withoutMina: boolean;

  guestName: string;
  pax: number;
  date: string; // yyyy-mm-dd
  validUntil: string;
  /** Assembled from the season, category and day count unless overridden. */
  packageTitle: string;
  packageTitleEdited: boolean;

  stays: BuilderStay[];
  /** Set when the staff member presses Complete; unlocks flights and pricing. */
  itineraryComplete: boolean;

  flight: FlightSelection;
  qurbaniIncluded: boolean;

  minaServiceIds: string[];
  arafatServiceIds: string[];
  includeIds: string[];
  requirementIds: string[];
  termIds: string[];
  includesNote: string;
  remarks: string;

  /** The currency to price in. "PKR" is the base; others convert from it. */
  currencyCode: string;
  discount: number;
  discountNote: string;
  /** Signed rounding adjustment on the net (subtotal - discount). Internal. */
  roundOff: number;
  manualTotal: number | null;

  // Package-only three-price pricing. Ignored entirely in quotation mode. A
  // package always prints all three tiers - there is no single-price mode.
  tiers: Record<TierOccupancy, TierRow>;
  addOns: Array<{ label: string; amount: number }>;

  set: <K extends keyof BuilderState>(key: K, value: BuilderState[K]) => void;
  addStay: (stay?: Partial<StayInput>) => void;
  updateStay: (key: string, patch: Partial<StayInput>) => void;
  removeStay: (key: string) => void;
  toggleService: (field: ServiceField, id: string) => void;
  setFlight: (patch: Partial<FlightSelection>) => void;
  updateTier: (occupancy: TierOccupancy, patch: Partial<TierRow>) => void;
  addAddOn: () => void;
  updateAddOn: (index: number, patch: Partial<{ label: string; amount: number }>) => void;
  removeAddOn: (index: number) => void;
  reset: (initial?: Partial<BuilderState>) => void;
}

/** One tier's controls in the package builder. */
export interface TierRow {
  /** Is this tier printed on the brochure? */
  offered: boolean;
  /** A typed-in price that replaces the calculated one. null = use calculated. */
  manualTotal: number | null;
  discount: number;
}

type ServiceField =
  | "minaServiceIds"
  | "arafatServiceIds"
  | "includeIds"
  | "requirementIds"
  | "termIds";

let counter = 0;
const newKey = () => `stay-${counter++}`;

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

type BuilderData = Omit<
  BuilderState,
  | "set"
  | "addStay"
  | "updateStay"
  | "removeStay"
  | "toggleService"
  | "setFlight"
  | "updateTier"
  | "addAddOn"
  | "updateAddOn"
  | "removeAddOn"
  | "reset"
>;

/** Every tier offered, no override or discount - the default for a new package. */
const emptyTiers = (): Record<TierOccupancy, TierRow> =>
  Object.fromEntries(
    TIER_OCCUPANCIES.map((occ) => [occ, { offered: true, manualTotal: null, discount: 0 }]),
  ) as Record<TierOccupancy, TierRow>;

const EMPTY: BuilderData = {
  quotationId: null,
  packageCategory: "",
  minaAccommodationId: "",
  withoutMina: false,
  guestName: "",
  pax: 2,
  date: today(),
  validUntil: "",
  packageTitle: "",
  packageTitleEdited: false,
  stays: [],
  itineraryComplete: false,
  flight: {
    included: false,
    returnRequired: true,
    roundTrip: false,
    roundTripId: null,
    outboundId: null,
    inboundId: null,
  },
  qurbaniIncluded: true,
  minaServiceIds: [],
  arafatServiceIds: [],
  includeIds: [],
  requirementIds: [],
  termIds: [],
  includesNote: "",
  remarks: "",
  currencyCode: "PKR",
  discount: 0,
  discountNote: "",
  roundOff: 0,
  manualTotal: null,
  tiers: emptyTiers(),
  addOns: [],
};

export const useBuilderStore = create<BuilderState>((set) => ({
  ...EMPTY,

  set: (key, value) => set({ [key]: value } as Partial<BuilderState>),

  addStay: (stay) =>
    set((s) => ({
      stays: [
        ...s.stays,
        {
          key: newKey(),
          blockId: stay?.blockId ?? "",
          locationId: stay?.locationId ?? "",
          accommodationId: stay?.accommodationId ?? "",
          roomType: stay?.roomType ?? null,
          occupancy: stay?.occupancy ?? null,
          sharingWord: stay?.sharingWord ?? null,
          mealId: stay?.mealId ?? null,
          mealNoteId: stay?.mealNoteId ?? null,
          rooms: stay?.rooms,
        },
      ],
      // Adding a stay reopens the itinerary.
      itineraryComplete: false,
    })),

  updateStay: (key, patch) =>
    set((s) => ({
      stays: s.stays.map((stay) => (stay.key === key ? { ...stay, ...patch } : stay)),
    })),

  removeStay: (key) =>
    set((s) => ({
      stays: s.stays.filter((stay) => stay.key !== key),
      itineraryComplete: false,
    })),

  toggleService: (field, id) =>
    set((s) => {
      const current = s[field];
      return {
        [field]: current.includes(id) ? current.filter((x) => x !== id) : [...current, id],
      } as Partial<BuilderState>;
    }),

  setFlight: (patch) => set((s) => ({ flight: { ...s.flight, ...patch } })),

  updateTier: (occupancy, patch) =>
    set((s) => ({ tiers: { ...s.tiers, [occupancy]: { ...s.tiers[occupancy], ...patch } } })),

  addAddOn: () => set((s) => ({ addOns: [...s.addOns, { label: "", amount: 0 }] })),
  updateAddOn: (index, patch) =>
    set((s) => ({ addOns: s.addOns.map((a, i) => (i === index ? { ...a, ...patch } : a)) })),
  removeAddOn: (index) => set((s) => ({ addOns: s.addOns.filter((_, i) => i !== index) })),

  // A fresh package/quotation starts with all tiers offered and no add-ons.
  reset: (initial) =>
    set({ ...EMPTY, date: today(), stays: [], tiers: emptyTiers(), addOns: [], ...initial }),
}));

// ------------------------------------------------------- local computation

export interface LocalResult {
  totalNights: number;
  /** The resolved currency and PKR-per-unit rate the amounts below are in. */
  currency: { code: string; symbol: string; decimals: number };
  exchangeRate: number;
  subtotal: number;
  /** Air fare per person, in the selected currency. */
  flightTotal: number;
  discount: number;
  /** Signed rounding adjustment settled into the final. Internal. */
  roundOff: number;
  finalTotal: number;
  manualOverride: boolean;
  issues: Issue[];
  flightIssues: string[];
  perStayNights: Record<string, number>;
  perStayTotal: Record<string, number>;
  suggestedHajjBlockId: string | null;
  /**
   * The calculated tier prices (package mode): the itinerary priced with the
   * hotels at each occupancy, plus the flight. `complete` is false when a hotel
   * has no rate for that tier, so the figure is short and the staff should type
   * the price in. Mirrors the server's `buildPackagePdfBundle` exactly.
   */
  tierAuto: Record<TierOccupancy, { total: number; complete: boolean }>;
}

/**
 * Recompute everything from the current selections and the config. Pure, so it
 * can run on every keystroke. Priced defensively: a half-filled row simply
 * contributes nothing rather than throwing.
 */
export function computeLocal(state: BuilderState, config: ConfigSnapshot): LocalResult {
  const complete = state.stays.filter(
    (s) => s.blockId && s.locationId && s.accommodationId,
  );

  const validation = makeValidationContext({
    blocks: config.blocks,
    locations: config.locations,
    accommodations: config.accommodations,
    meals: config.meals,
    mealNotes: config.mealNotes,
    withoutMina: state.withoutMina,
  });

  const issues = complete.length > 0 ? validateItinerary(complete, validation) : [];
  const suggested = suggestHajjBlock(complete, validation);

  const perStayNights: Record<string, number> = {};
  const perStayTotal: Record<string, number> = {};

  const flights = priceFlights(state.flight, config.flights);

  // Resolve the quotation's currency from config; PKR (or an unknown code) is
  // the base. Its rate converts the PKR base rates into the shown currency.
  const picked = config.currencies.find(
    (c) => c.enabled && c.code.toUpperCase() === state.currencyCode.toUpperCase(),
  );
  const exchangeRate = picked && picked.rate > 0 ? picked.rate : 1;
  const currency = picked
    ? { code: picked.code, symbol: picked.symbol, decimals: picked.decimals }
    : { code: "PKR", symbol: "PKR", decimals: 0 };

  let totalNights = 0;
  let subtotal = 0;
  let manualOverride = state.manualTotal !== null;
  let finalTotal = 0;
  let roundOff = 0;
  const tierAuto: LocalResult["tierAuto"] = {
    Quad: { total: 0, complete: false },
    Triple: { total: 0, complete: false },
    Double: { total: 0, complete: false },
  };

  try {
    const pricing = makePricingContext({
      blocks: config.blocks,
      accommodations: config.accommodations,
      locations: config.locations,
      rates: config.rates,
    });

    // A Hajj row inside a stay that spans it contributes no nights. Pricing a
    // row on its own cannot see that, so the set is worked out here from all
    // the rows and applied to each result.
    const { nested } = nestedHajjBlocks(
      complete
        .map((stay) => config.blocks.find((block) => block.id === stay.blockId))
        .filter((block): block is (typeof config.blocks)[number] => Boolean(block)),
    );

    // Price each row on its own so one bad row cannot blank the whole total.
    for (const stay of state.stays) {
      if (!stay.blockId || !stay.accommodationId) continue;
      try {
        const [priced] = priceStays([stay], pricing, state.pax);
        if (priced) {
          perStayNights[stay.key] = nested.has(stay.blockId) ? 0 : priced.nights;
          perStayTotal[stay.key] = priced.lineTotal;
        }
      } catch {
        // Missing rate / room choice: leave this row unpriced.
      }
    }

    const pricedComplete = applyNestedNights(
      complete
        .map((stay) => {
          try {
            return priceStays([stay], pricing, state.pax)[0];
          } catch {
            return null;
          }
        })
        .filter((x): x is NonNullable<typeof x> => x !== null),
      config.blocks,
    );

    const totals = calculateTotals({
      stays: pricedComplete,
      flightTotal: flights.total,
      discount: state.discount,
      roundOff: state.roundOff,
      manualTotal: state.manualTotal,
      pax: state.pax,
      exchangeRate,
      decimals: currency.decimals,
    });
    totalNights = totals.totalNights;
    subtotal = totals.subtotal;
    finalTotal = totals.finalTotal;
    manualOverride = totals.manualOverride;
    roundOff = totals.roundOff;

    // Tier suggestions: the hotels priced at each occupancy, plus the flight
    // (which is the same across tiers), converted from PKR into the package's
    // own currency - the only figure here that needs converting, since a
    // manual override or discount is typed in directly in that currency.
    // Matches the server on save/print.
    for (const tier of priceTiers(complete, pricing)) {
      tierAuto[tier.occupancy] = {
        total: roundToDecimals(convertFromPkr(tier.total + flights.total, exchangeRate), currency.decimals),
        complete: tier.complete,
      };
    }
  } catch {
    // Config not ready; totals stay at zero.
  }

  return {
    totalNights,
    currency,
    exchangeRate,
    subtotal,
    // The air fare shown per person, converted into the quotation's currency.
    flightTotal: convertFromPkr(flights.total, exchangeRate),
    discount: Math.min(state.discount, subtotal),
    roundOff,
    finalTotal,
    manualOverride,
    issues,
    flightIssues: flights.issues,
    perStayNights,
    perStayTotal,
    suggestedHajjBlockId: suggested?.id ?? null,
    tierAuto,
  };
}

/**
 * The title as it should read right now. Staff can override it; once they type
 * their own, `packageTitleEdited` stops it being rebuilt underneath them.
 */
export function autoPackageTitle(
  state: BuilderState,
  config: ConfigSnapshot,
  totalNights: number,
  asPackage = false,
): string {
  // The Gregorian year comes from the season's calendar, via any resolved block.
  const withDate = config.blocks.find((block) => block.startGregorian);
  const gregorianYear = withDate?.startGregorian
    ? Number(withDate.startGregorian.slice(0, 4))
    : null;

  return buildPackageTitle({
    season: config.season,
    gregorianYear,
    category: state.packageCategory,
    totalNights,
    itineraryComplete: state.itineraryComplete,
    // A package template names itself plainly; only a quotation drawn from it
    // wears the "(Customize)" suffix.
    suffix: asPackage ? PACKAGE_TEMPLATE_SUFFIX : undefined,
  });
}

/** The payload the API expects, built from the current state. */
export function toApiPayload(state: BuilderState, season: string) {
  return {
    season,
    guest: { name: state.guestName.trim(), pax: state.pax },
    date: state.date,
    validUntil: state.validUntil || null,
    packageTitle: state.packageTitle,
    packageCategory: state.packageCategory,
    withoutMina: state.withoutMina,
    qurbaniIncluded: state.qurbaniIncluded,
    stays: state.stays
      .filter((s) => s.blockId && s.locationId && s.accommodationId)
      .map(({ key: _key, ...stay }) => stay),
    flight: state.flight,
    minaServiceIds: state.minaServiceIds,
    arafatServiceIds: state.arafatServiceIds,
    includeIds: state.includeIds,
    requirementIds: state.requirementIds,
    termIds: state.termIds,
    includesNote: state.includesNote,
    remarks: state.remarks,
    currencyCode: state.currencyCode,
    discount: state.discount,
    discountNote: state.discountNote,
    roundOff: state.roundOff,
    manualTotal: state.manualTotal,
  };
}

/**
 * A package is the same shape minus the customer and the money: no guest, no
 * dates, no discount or manual total. A name replaces the guest.
 */
export function toPackagePayload(state: BuilderState, season: string, name: string) {
  return {
    name: name.trim(),
    season,
    packageTitle: state.packageTitle,
    packageCategory: state.packageCategory,
    withoutMina: state.withoutMina,
    qurbaniIncluded: state.qurbaniIncluded,
    minaAccommodationId: state.minaAccommodationId || null,
    stays: state.stays
      .filter((s) => s.blockId && s.locationId && s.accommodationId)
      .map(({ key: _key, ...stay }) => stay),
    flight: state.flight,
    minaServiceIds: state.minaServiceIds,
    arafatServiceIds: state.arafatServiceIds,
    includeIds: state.includeIds,
    requirementIds: state.requirementIds,
    termIds: state.termIds,
    includesNote: state.includesNote,
    remarks: state.remarks,
    // The package's own currency - everything below is typed in directly in
    // it, not PKR-then-converted.
    currencyCode: state.currencyCode,
    tierPricing: {
      // A package always prints all three tiers - there is no single-price mode.
      enabled: true,
      Quad: tierDoc(state.tiers.Quad),
      Triple: tierDoc(state.tiers.Triple),
      Double: tierDoc(state.tiers.Double),
    },
    addOns: state.addOns
      .map((addOn) => ({ label: addOn.label.trim(), amount: Math.max(0, roundToDecimals(addOn.amount, 2)) }))
      .filter((addOn) => addOn.label.length > 0),
  };
}

/** A tier's stored controls, or null when it is not offered on the brochure. */
function tierDoc(row: TierRow) {
  return row.offered ? { manualTotal: row.manualTotal, discount: Math.max(0, row.discount) } : null;
}
