/**
 * The quotation being built.
 *
 * Every change recomputes totals and warnings locally (via @junaidi/shared) so
 * the form feels instant, and the server recalculates the same way on save -
 * the server is the authority on the price.
 */

import {
  buildPackageTitle,
  calculateTotals,
  makePricingContext,
  makeValidationContext,
  priceFlights,
  priceStays,
  suggestHajjBlock,
  validateItinerary,
  type FlightSelection,
  type Issue,
  type StayInput,
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

  discount: number;
  discountNote: string;
  manualTotal: number | null;

  set: <K extends keyof BuilderState>(key: K, value: BuilderState[K]) => void;
  addStay: (stay?: Partial<StayInput>) => void;
  updateStay: (key: string, patch: Partial<StayInput>) => void;
  removeStay: (key: string) => void;
  toggleService: (field: ServiceField, id: string) => void;
  setFlight: (patch: Partial<FlightSelection>) => void;
  reset: (initial?: Partial<BuilderState>) => void;
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
  "set" | "addStay" | "updateStay" | "removeStay" | "toggleService" | "setFlight" | "reset"
>;

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
  discount: 0,
  discountNote: "",
  manualTotal: null,
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

  reset: (initial) => set({ ...EMPTY, date: today(), stays: [], ...initial }),
}));

// ------------------------------------------------------- local computation

export interface LocalResult {
  totalNights: number;
  subtotal: number;
  flightTotal: number;
  discount: number;
  finalTotal: number;
  manualOverride: boolean;
  issues: Issue[];
  flightIssues: string[];
  perStayNights: Record<string, number>;
  perStayTotal: Record<string, number>;
  suggestedHajjBlockId: string | null;
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

  let totalNights = 0;
  let subtotal = 0;
  let manualOverride = state.manualTotal !== null;
  let finalTotal = 0;

  try {
    const pricing = makePricingContext({
      blocks: config.blocks,
      accommodations: config.accommodations,
      locations: config.locations,
      rates: config.rates,
    });

    // Price each row on its own so one bad row cannot blank the whole total.
    for (const stay of state.stays) {
      if (!stay.blockId || !stay.accommodationId) continue;
      try {
        const [priced] = priceStays([stay], pricing);
        if (priced) {
          perStayNights[stay.key] = priced.nights;
          perStayTotal[stay.key] = priced.lineTotal;
        }
      } catch {
        // Missing rate / room choice: leave this row unpriced.
      }
    }

    const pricedComplete = complete
      .map((stay) => {
        try {
          return priceStays([stay], pricing)[0];
        } catch {
          return null;
        }
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);

    const totals = calculateTotals({
      stays: pricedComplete,
      flightTotal: flights.total,
      discount: state.discount,
      manualTotal: state.manualTotal,
    });
    totalNights = totals.totalNights;
    subtotal = totals.subtotal;
    finalTotal = totals.finalTotal;
    manualOverride = totals.manualOverride;
  } catch {
    // Config not ready; totals stay at zero.
  }

  return {
    totalNights,
    subtotal,
    flightTotal: flights.total,
    discount: Math.min(state.discount, subtotal),
    finalTotal,
    manualOverride,
    issues,
    flightIssues: flights.issues,
    perStayNights,
    perStayTotal,
    suggestedHajjBlockId: suggested?.id ?? null,
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
    discount: state.discount,
    discountNote: state.discountNote,
    manualTotal: state.manualTotal,
  };
}
