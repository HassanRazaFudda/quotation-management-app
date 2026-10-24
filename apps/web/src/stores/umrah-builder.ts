/**
 * The Umrah quotation being built.
 *
 * Every change reprices locally with the same `@junaidi/shared` function the
 * server runs on save, so the form feels instant - and the server stays the
 * authority on the price. Unlike the Hajj builder it needs no configuration to
 * price anything: every rate is typed in. The only thing it borrows from the
 * app's config is the currency list, to *prefill* exchange rates the agent can
 * change for this quotation.
 */

import {
  priceUmrahQuotation,
  roundToDecimals,
  UMRAH_TIERS,
  type StyledLine,
  type UmrahChargeBasis,
  type UmrahLineKey,
  type UmrahPriceDisplay,
  type UmrahPricing,
  type UmrahPricingInput,
  type UmrahPricingMode,
  type UmrahRateBasis,
  type UmrahTier,
  type UmrahTransportDisplay,
} from "@junaidi/shared";
import { create } from "zustand";

import type { UmrahQuotation } from "@/lib/umrah-types";

export interface UmrahBuilderRoom {
  key: string;
  roomType: string;
  rooms: number;
  persons: number;
  rate: number;
}

export interface UmrahBuilderStay {
  key: string;
  city: string;
  hotelName: string;
  distance: string;
  checkIn: string;
  checkOut: string;
  meal: string;
  currencyCode: string;
  rateBasis: UmrahRateBasis;
  rooms: UmrahBuilderRoom[];
  tierRates: Record<UmrahTier, number | null>;
  withoutBedRate: number;
}

export interface UmrahBuilderLeg {
  key: string;
  route: string;
  isCustomRoute: boolean;
  vehicle: string;
  cost: number;
  currencyCode: string;
}

export interface UmrahBuilderCharge {
  key: string;
  label: string;
  amount: number;
  currencyCode: string;
  basis: UmrahChargeBasis;
}

export interface UmrahBuilderFlight {
  included: boolean;
  airline: string;
  outbound: string;
  inbound: string;
  adultFare: number;
  infantFare: number;
  currencyCode: string;
}

/** The internal controls on one printed price. */
export interface LineControl {
  offered: boolean;
  discount: number;
  roundOff: number;
  manualTotal: number | null;
}

export type LineControls = Record<UmrahLineKey, LineControl>;

export interface UmrahBuilderCurrency {
  code: string;
  symbol: string;
  decimals: number;
}

export interface UmrahBuilderState {
  /** Set when editing an existing quotation. */
  quotationId: string | null;

  guestName: string;
  pax: number;
  withoutBedPax: number;
  infants: number;
  date: string;
  validUntil: string;
  packageTitle: string;

  pricingMode: UmrahPricingMode;
  priceDisplay: UmrahPriceDisplay;
  transportDisplay: UmrahTransportDisplay;

  currency: UmrahBuilderCurrency;
  /** PKR per one unit of each currency used, as prefilled or typed. */
  exchangeRates: Record<string, number>;

  stays: UmrahBuilderStay[];
  transportLegs: UmrahBuilderLeg[];
  flight: UmrahBuilderFlight;
  charges: UmrahBuilderCharge[];

  lines: LineControls;
  discountNote: string;

  /** One line per bullet, as typed. */
  includesText: string;
  requirementsText: string;
  termsText: string;
  /** Styling of lines that came from the settings or a saved quotation, matched by text. */
  knownLines: StyledLine[];
  remarks: string;

  set: <K extends keyof UmrahBuilderState>(key: K, value: UmrahBuilderState[K]) => void;
  addStay: () => void;
  updateStay: (key: string, patch: Partial<UmrahBuilderStay>) => void;
  removeStay: (key: string) => void;
  addRoom: (stayKey: string) => void;
  updateRoom: (stayKey: string, roomKey: string, patch: Partial<UmrahBuilderRoom>) => void;
  removeRoom: (stayKey: string, roomKey: string) => void;
  addLeg: () => void;
  updateLeg: (key: string, patch: Partial<UmrahBuilderLeg>) => void;
  removeLeg: (key: string) => void;
  addCharge: () => void;
  updateCharge: (key: string, patch: Partial<UmrahBuilderCharge>) => void;
  removeCharge: (key: string) => void;
  setFlight: (patch: Partial<UmrahBuilderFlight>) => void;
  setLine: (key: UmrahLineKey, patch: Partial<LineControl>) => void;
  reset: (initial?: Partial<UmrahBuilderState>) => void;
}

// ----------------------------------------------------------------- defaults

let counter = 0;
const newKey = (): string => `u-${counter++}`;

const today = (): string => new Date().toISOString().slice(0, 10);

/** Hotels are usually quoted in Saudi riyals. */
export const DEFAULT_RATE_CURRENCY = "SAR";

export const emptyLineControl = (): LineControl => ({ offered: true, discount: 0, roundOff: 0, manualTotal: null });

export const emptyLines = (): LineControls => ({
  main: emptyLineControl(),
  withoutBed: emptyLineControl(),
  infant: emptyLineControl(),
  Quad: emptyLineControl(),
  Triple: emptyLineControl(),
  Double: emptyLineControl(),
});

const emptyRoom = (): UmrahBuilderRoom => ({ key: newKey(), roomType: "Quad", rooms: 1, persons: 0, rate: 0 });

function emptyStay(currencyCode: string, after?: UmrahBuilderStay): UmrahBuilderStay {
  return {
    key: newKey(),
    city: "",
    hotelName: "",
    distance: "",
    // A trip is a chain: the next hotel starts the day the last one ends.
    checkIn: after?.checkOut ?? "",
    checkOut: "",
    meal: "",
    currencyCode,
    rateBasis: after?.rateBasis ?? "room",
    rooms: [emptyRoom()],
    tierRates: { Quad: null, Triple: null, Double: null },
    withoutBedRate: 0,
  };
}

const PKR_CURRENCY: UmrahBuilderCurrency = { code: "PKR", symbol: "PKR", decimals: 0 };

const emptyFlight = (): UmrahBuilderFlight => ({
  included: false,
  airline: "",
  outbound: "",
  inbound: "",
  adultFare: 0,
  infantFare: 0,
  currencyCode: "PKR",
});

type BuilderData = Omit<
  UmrahBuilderState,
  | "set"
  | "addStay"
  | "updateStay"
  | "removeStay"
  | "addRoom"
  | "updateRoom"
  | "removeRoom"
  | "addLeg"
  | "updateLeg"
  | "removeLeg"
  | "addCharge"
  | "updateCharge"
  | "removeCharge"
  | "setFlight"
  | "setLine"
  | "reset"
>;

const freshData = (): BuilderData => ({
  quotationId: null,
  guestName: "",
  pax: 2,
  withoutBedPax: 0,
  infants: 0,
  date: today(),
  validUntil: "",
  packageTitle: "",
  pricingMode: "single",
  priceDisplay: "average",
  transportDisplay: "included",
  currency: PKR_CURRENCY,
  exchangeRates: {},
  stays: [emptyStay(DEFAULT_RATE_CURRENCY)],
  transportLegs: [],
  flight: emptyFlight(),
  charges: [],
  lines: emptyLines(),
  discountNote: "",
  includesText: "",
  requirementsText: "",
  termsText: "",
  knownLines: [],
  remarks: "",
});

export const useUmrahBuilderStore = create<UmrahBuilderState>((set) => ({
  ...freshData(),

  set: (key, value) => set({ [key]: value } as Partial<UmrahBuilderState>),

  addStay: () =>
    set((s) => {
      const last = s.stays[s.stays.length - 1];
      return { stays: [...s.stays, emptyStay(last?.currencyCode ?? DEFAULT_RATE_CURRENCY, last)] };
    }),
  updateStay: (key, patch) =>
    set((s) => ({ stays: s.stays.map((stay) => (stay.key === key ? { ...stay, ...patch } : stay)) })),
  removeStay: (key) => set((s) => ({ stays: s.stays.filter((stay) => stay.key !== key) })),

  addRoom: (stayKey) =>
    set((s) => ({
      stays: s.stays.map((stay) =>
        stay.key === stayKey ? { ...stay, rooms: [...stay.rooms, { ...emptyRoom(), roomType: "Double" }] } : stay,
      ),
    })),
  updateRoom: (stayKey, roomKey, patch) =>
    set((s) => ({
      stays: s.stays.map((stay) =>
        stay.key === stayKey
          ? { ...stay, rooms: stay.rooms.map((room) => (room.key === roomKey ? { ...room, ...patch } : room)) }
          : stay,
      ),
    })),
  removeRoom: (stayKey, roomKey) =>
    set((s) => ({
      stays: s.stays.map((stay) =>
        stay.key === stayKey ? { ...stay, rooms: stay.rooms.filter((room) => room.key !== roomKey) } : stay,
      ),
    })),

  addLeg: () =>
    set((s) => ({
      transportLegs: [
        ...s.transportLegs,
        {
          key: newKey(),
          route: "",
          isCustomRoute: false,
          vehicle: "",
          cost: 0,
          currencyCode: s.transportLegs[s.transportLegs.length - 1]?.currencyCode ?? s.currency.code,
        },
      ],
    })),
  updateLeg: (key, patch) =>
    set((s) => ({ transportLegs: s.transportLegs.map((leg) => (leg.key === key ? { ...leg, ...patch } : leg)) })),
  removeLeg: (key) => set((s) => ({ transportLegs: s.transportLegs.filter((leg) => leg.key !== key) })),

  addCharge: () =>
    set((s) => ({
      charges: [
        ...s.charges,
        { key: newKey(), label: "", amount: 0, currencyCode: s.currency.code, basis: "perPerson" },
      ],
    })),
  updateCharge: (key, patch) =>
    set((s) => ({ charges: s.charges.map((charge) => (charge.key === key ? { ...charge, ...patch } : charge)) })),
  removeCharge: (key) => set((s) => ({ charges: s.charges.filter((charge) => charge.key !== key) })),

  setFlight: (patch) => set((s) => ({ flight: { ...s.flight, ...patch } })),
  setLine: (key, patch) => set((s) => ({ lines: { ...s.lines, [key]: { ...s.lines[key], ...patch } } })),

  reset: (initial) => set({ ...freshData(), ...initial }),
}));

// ------------------------------------------------------------------ helpers

/**
 * A single-room-type quote seats everyone with a bed in the one room line, so
 * the guest count is never typed twice: it is always the quote's PAX.
 */
export function normaliseRooms(
  mode: UmrahPricingMode,
  pax: number,
  rooms: UmrahBuilderRoom[],
): UmrahBuilderRoom[] {
  if (mode !== "single") return rooms;
  const first = rooms[0] ?? emptyRoom();
  return [{ ...first, persons: pax }];
}

/** Every non-PKR currency the quotation uses, the quote currency first. */
export function usedCurrencyCodes(state: BuilderData): string[] {
  const codes = [
    state.currency.code,
    ...state.stays.map((s) => s.currencyCode),
    ...state.transportLegs.map((l) => l.currencyCode),
    ...state.charges.map((c) => c.currencyCode),
    ...(state.flight.included ? [state.flight.currencyCode] : []),
  ]
    .map((code) => code.trim().toUpperCase())
    .filter((code) => code && code !== "PKR");
  return [...new Set(codes)];
}

/** The pure pricing input the shared function (and the server) works from. */
export function toPricingInput(state: BuilderData): UmrahPricingInput {
  return {
    mode: state.pricingMode,
    priceDisplay: state.priceDisplay,
    transportDisplay: state.transportDisplay,
    guest: { pax: state.pax, withoutBedPax: state.withoutBedPax, infants: state.infants },
    currency: state.currency,
    exchangeRates: usedCurrencyCodes(state).map((code) => ({ code, rate: state.exchangeRates[code] ?? 0 })),
    stays: state.stays.map((stay) => ({
      city: stay.city,
      hotelName: stay.hotelName,
      distance: stay.distance,
      checkIn: stay.checkIn,
      checkOut: stay.checkOut,
      meal: stay.meal,
      currencyCode: stay.currencyCode,
      rateBasis: stay.rateBasis,
      rooms: normaliseRooms(state.pricingMode, state.pax, stay.rooms).map(({ roomType, rooms, persons, rate }) => ({
        roomType,
        rooms,
        persons,
        rate,
      })),
      tierRates: stay.tierRates,
      withoutBedRate: stay.withoutBedRate,
    })),
    transportLegs: state.transportLegs.map(({ route, isCustomRoute, vehicle, cost, currencyCode }) => ({
      route,
      isCustomRoute,
      vehicle,
      cost,
      currencyCode,
    })),
    flight: state.flight,
    charges: state.charges.map(({ label, amount, currencyCode, basis }) => ({ label, amount, currencyCode, basis })),
    lineSettings: (Object.keys(state.lines) as UmrahLineKey[]).map((key) => ({ key, ...state.lines[key] })),
  };
}

/** Reprice the quotation as it stands. Pure, so it can run on every keystroke. */
export function computeUmrah(state: BuilderData): UmrahPricing {
  return priceUmrahQuotation(toPricingInput(state));
}

const toLines = (text: string, known: StyledLine[]): StyledLine[] =>
  text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => known.find((k) => k.text === line) ?? { text: line });

const toText = (items: StyledLine[]): string => items.map((item) => item.text).join("\n");

/** The payload the API expects, built from the current state. */
export function toUmrahPayload(state: BuilderData) {
  const input = toPricingInput(state);
  return {
    guest: { name: state.guestName.trim(), pax: state.pax, withoutBedPax: state.withoutBedPax, infants: state.infants },
    date: state.date,
    validUntil: state.validUntil || null,
    packageTitle: state.packageTitle,
    pricingMode: state.pricingMode,
    priceDisplay: state.priceDisplay,
    transportDisplay: state.transportDisplay,
    currency: state.currency,
    // A currency still missing its rate is reported by the form; only real rates are sent.
    exchangeRates: input.exchangeRates.filter((entry) => entry.rate > 0),
    stays: input.stays,
    transportLegs: input.transportLegs,
    flight: input.flight,
    charges: input.charges,
    lineSettings: input.lineSettings,
    discountNote: state.discountNote,
    includes: toLines(state.includesText, state.knownLines),
    requirements: toLines(state.requirementsText, state.knownLines),
    terms: toLines(state.termsText, state.knownLines),
    remarks: state.remarks,
  };
}

/**
 * Re-express the typed discounts and prices in a new display currency, so the
 * real value survives the switch. Round-off nudges a total to a tidy number in
 * one currency's units and does not carry over, so it resets - the same rule
 * the Hajj builder applies.
 */
export function convertLineControls(
  lines: LineControls,
  fromRate: number,
  toRate: number,
  decimals: number,
): LineControls {
  const convert = (value: number): number =>
    fromRate > 0 && toRate > 0 ? roundToDecimals((value * fromRate) / toRate, decimals) : 0;
  const next = emptyLines();
  for (const key of Object.keys(lines) as UmrahLineKey[]) {
    const line = lines[key];
    next[key] = {
      offered: line.offered,
      discount: convert(line.discount),
      roundOff: 0,
      manualTotal: line.manualTotal === null ? null : convert(line.manualTotal),
    };
  }
  return next;
}

/**
 * Fill the form from a saved quotation: to edit it (keeps its id and date), or
 * to start a copy (a fresh draft dated today, with the per-customer discount,
 * round-off and typed prices cleared).
 */
export function builderDataFromQuotation(
  q: UmrahQuotation,
  mode: "edit" | "duplicate",
): Partial<UmrahBuilderState> {
  const lines = emptyLines();
  if (mode === "edit") {
    for (const setting of q.lineSettings) {
      if (setting.key in lines) {
        lines[setting.key as UmrahLineKey] = {
          offered: setting.offered,
          discount: setting.discount,
          roundOff: setting.roundOff,
          manualTotal: setting.manualTotal,
        };
      }
    }
  } else {
    // Which room types were on offer is a choice about the itinerary, not the customer.
    for (const setting of q.lineSettings) {
      if (setting.key in lines) lines[setting.key as UmrahLineKey].offered = setting.offered;
    }
  }

  return {
    quotationId: mode === "edit" ? q._id : null,
    guestName: q.guest.name,
    pax: q.guest.pax,
    withoutBedPax: q.guest.withoutBedPax ?? 0,
    infants: q.guest.infants ?? 0,
    date: mode === "edit" ? q.date.slice(0, 10) : today(),
    validUntil: mode === "edit" ? (q.validUntil?.slice(0, 10) ?? "") : "",
    packageTitle: q.packageTitle,
    pricingMode: q.pricingMode,
    priceDisplay: q.priceDisplay,
    transportDisplay: q.transportDisplay,
    currency: q.currency,
    exchangeRates: Object.fromEntries(q.exchangeRates.map((entry) => [entry.code, entry.rate])),
    stays: q.stays.map((stay) => ({
      key: newKey(),
      city: stay.city,
      hotelName: stay.hotelName,
      distance: stay.distance,
      checkIn: stay.checkIn,
      checkOut: stay.checkOut,
      meal: stay.meal,
      currencyCode: stay.currencyCode,
      rateBasis: stay.rateBasis,
      rooms: stay.rooms.length > 0 ? stay.rooms.map((room) => ({ key: newKey(), ...room })) : [emptyRoom()],
      tierRates: { Quad: stay.tierRates.Quad ?? null, Triple: stay.tierRates.Triple ?? null, Double: stay.tierRates.Double ?? null },
      withoutBedRate: stay.withoutBedRate,
    })),
    transportLegs: q.transportLegs.map((leg) => ({ key: newKey(), ...leg })),
    flight: { ...q.flight },
    charges: q.charges.map((charge) => ({ key: newKey(), ...charge })),
    lines,
    discountNote: mode === "edit" ? q.discountNote : "",
    includesText: toText(q.includes),
    requirementsText: toText(q.requirements),
    termsText: toText(q.terms),
    knownLines: [...q.includes, ...q.requirements, ...q.terms],
    remarks: q.remarks,
  };
}

/** A fresh quotation, seeded with the admin's default includes / requirements / terms. */
export function builderDataFromDefaults(defaults: {
  includes: StyledLine[];
  requirements: StyledLine[];
  terms: StyledLine[];
}): Partial<UmrahBuilderState> {
  return {
    includesText: toText(defaults.includes),
    requirementsText: toText(defaults.requirements),
    termsText: toText(defaults.terms),
    knownLines: [...defaults.includes, ...defaults.requirements, ...defaults.terms],
  };
}

export { UMRAH_TIERS };
