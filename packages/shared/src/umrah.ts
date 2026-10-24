/**
 * Umrah pricing.
 *
 * Unlike Hajj, nothing here is looked up: the agent types every rate - hotel,
 * transport, flight, extra charges - straight into the quotation, in whatever
 * currency the supplier quoted. That is why this module shares no code with the
 * Hajj block/rate pricing and never imports a Hajj rate, accommodation or date
 * block. It only reuses the generic money arithmetic (`calculateTotals`).
 *
 * The same function runs in the browser for the live total and on the server as
 * the trusted recompute on save; the server never believes a total it is sent.
 */

import { calculateTotals, roundToDecimals } from "./pricing";
import type { PricedStay, StyledLine } from "./types";

// ----------------------------------------------------------------- constants

export const UMRAH_PRICING_MODES = ["single", "family", "tiered"] as const;
export type UmrahPricingMode = (typeof UMRAH_PRICING_MODES)[number];

/** How the with-bed and without-bed prices are shown (single / family modes). */
export const UMRAH_PRICE_DISPLAYS = ["average", "breakdown"] as const;
export type UmrahPriceDisplay = (typeof UMRAH_PRICE_DISPLAYS)[number];

/** Is transport folded into the per-person price, or shown as its own line? */
export const UMRAH_TRANSPORT_DISPLAYS = ["included", "separate"] as const;
export type UmrahTransportDisplay = (typeof UMRAH_TRANSPORT_DISPLAYS)[number];

/** A hotel's rate is per room per night, or per person per night. */
export const UMRAH_RATE_BASES = ["room", "person"] as const;
export type UmrahRateBasis = (typeof UMRAH_RATE_BASES)[number];

export const UMRAH_CHARGE_BASES = ["perPerson", "perInfant", "perGroup"] as const;
export type UmrahChargeBasis = (typeof UMRAH_CHARGE_BASES)[number];

export const UMRAH_TIERS = ["Quad", "Triple", "Double"] as const;
export type UmrahTier = (typeof UMRAH_TIERS)[number];

/** People per room, used to turn a per-room tier rate into a per-person one. */
export const UMRAH_TIER_CAPACITY: Record<UmrahTier, number> = { Quad: 4, Triple: 3, Double: 2 };

export const UMRAH_TRANSPORT_ROUTES = [
  "Makkah to Madinah",
  "Madinah to Makkah",
  "Jeddah to Makkah",
  "Jeddah to Madinah",
  "Makkah to Jeddah Airport",
  "Madinah to Madinah Airport",
] as const;

/** The longest single stay accepted; a typo in a year would otherwise price silently. */
export const UMRAH_MAX_NIGHTS = 120;

// -------------------------------------------------------------------- input

export interface UmrahRoomLine {
  /** "Quad", "Double", "Suite" ... free text. */
  roomType: string;
  /** Number of rooms. Prices a per-room rate; display only for a per-person rate. */
  rooms: number;
  /** How many of the with-bed guests stay in these rooms. */
  persons: number;
  /** Per night, in the stay's currency; per room or per person by the stay's basis. */
  rate: number;
}

export interface UmrahStayInput {
  city: string;
  hotelName: string;
  /** Free text, e.g. "200 mtrs". Display only. */
  distance?: string;
  /** "yyyy-mm-dd". */
  checkIn: string;
  checkOut: string;
  /** Free text, e.g. "Breakfast". Display only. */
  meal?: string;
  currencyCode: string;
  rateBasis: UmrahRateBasis;
  /** Single and family modes. */
  rooms: UmrahRoomLine[];
  /** Room-types mode: nightly rate per tier, null when this hotel has no such room. */
  tierRates: Record<UmrahTier, number | null>;
  /** Per person per night for a guest who shares a room without their own bed. */
  withoutBedRate: number;
}

export interface UmrahLegInput {
  route: string;
  isCustomRoute?: boolean;
  vehicle: string;
  /** The whole leg's cost (one vehicle), not per person. */
  cost: number;
  currencyCode: string;
}

export interface UmrahFlightInput {
  included: boolean;
  airline: string;
  outbound: string;
  inbound: string;
  adultFare: number;
  infantFare: number;
  currencyCode: string;
}

export interface UmrahChargeInput {
  label: string;
  amount: number;
  currencyCode: string;
  basis: UmrahChargeBasis;
}

/** Controls for one printed price. All internal: only the final figure prints. */
export interface UmrahLineSetting {
  key: string;
  /** Room-types mode: is this tier printed? Absent means yes. */
  offered?: boolean;
  discount: number;
  roundOff: number;
  manualTotal: number | null;
}

export interface UmrahPricingInput {
  mode: UmrahPricingMode;
  priceDisplay: UmrahPriceDisplay;
  transportDisplay: UmrahTransportDisplay;
  guest: {
    /** Guests with a bed (at least one). */
    pax: number;
    /** Guests sharing a room without their own bed - any age. */
    withoutBedPax: number;
    infants: number;
  };
  /** The currency every price is shown in. */
  currency: { code: string; symbol: string; decimals: number };
  /** PKR per one unit of each currency used. PKR itself is implicit (1). */
  exchangeRates: Array<{ code: string; rate: number }>;
  stays: UmrahStayInput[];
  transportLegs: UmrahLegInput[];
  flight: UmrahFlightInput;
  charges: UmrahChargeInput[];
  lineSettings: UmrahLineSetting[];
}

// ------------------------------------------------------------------- output

export interface UmrahIssue {
  severity: "error" | "warning";
  message: string;
  /** Where it applies, e.g. "stays.0.checkOut". Lets the form point at the field. */
  path: string;
}

export interface UmrahPricedStay {
  nights: number;
  /** The with-bed guests' room cost for this stay, in the quote currency (single/family). */
  cost: number;
}

export type UmrahLineKey = "main" | "withoutBed" | "infant" | UmrahTier;

export interface UmrahPriceLine {
  key: UmrahLineKey;
  label: string;
  /** Heads this price is per. */
  count: number;
  /** The whole group's cost for this line, before discount and rounding. */
  groupTotal: number;
  subtotal: number;
  discount: number;
  roundOff: number;
  /** Per person, what prints. */
  finalTotal: number;
  manualOverride: boolean;
}

export interface UmrahPricing {
  issues: UmrahIssue[];
  hasErrors: boolean;
  totalNights: number;
  stays: UmrahPricedStay[];
  /** All transport legs, in the quote currency. */
  transportTotal: number;
  lines: UmrahPriceLine[];
  /** Room-types mode: a tier with a missing hotel rate - its figure is short. */
  tierIncomplete: Record<UmrahTier, boolean>;
  /** The whole booking, for payments. 0 in room-types mode, which cannot be confirmed. */
  grandTotal: number;
  /** The main printed price per person, for lists. */
  finalTotal: number;
}

export function umrahHasErrors(issues: UmrahIssue[]): boolean {
  return issues.some((issue) => issue.severity === "error");
}

// -------------------------------------------------------------------- dates

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** "yyyy-mm-dd" to UTC midnight in ms, or null when it is not a real date. */
export function parseIsoDate(value: string): number | null {
  const match = ISO_DATE.exec(value);
  if (!match) return null;
  const [, y, m, d] = match;
  const ms = Date.UTC(Number(y), Number(m) - 1, Number(d));
  const check = new Date(ms);
  if (
    check.getUTCFullYear() !== Number(y) ||
    check.getUTCMonth() !== Number(m) - 1 ||
    check.getUTCDate() !== Number(d)
  ) {
    return null;
  }
  return ms;
}

/**
 * Nights between check-in and check-out: whole days, UTC, so a timezone can
 * never move a stay by one night. 0 for anything that is not a valid forward
 * range - callers report that as an error.
 */
export function nightsBetween(checkIn: string, checkOut: string): number {
  const from = parseIsoDate(checkIn);
  const to = parseIsoDate(checkOut);
  if (from === null || to === null) return 0;
  return Math.max(0, Math.round((to - from) / 86_400_000));
}

// ----------------------------------------------------------------- currency

function rateOf(code: string, rates: UmrahPricingInput["exchangeRates"]): number | null {
  const wanted = code.trim().toUpperCase();
  if (wanted === "PKR") return 1;
  const found = rates.find((entry) => entry.code.trim().toUpperCase() === wanted)?.rate;
  return typeof found === "number" && Number.isFinite(found) && found > 0 ? found : null;
}

const isMoney = (value: number): boolean => Number.isFinite(value) && value >= 0;
const isCount = (value: number): boolean => Number.isInteger(value) && value >= 0;

/** A stand-in stay carrying only what `calculateTotals` reads: nights and the group cost. */
function totalsStay(groupTotal: number, nights: number): PricedStay {
  return {
    blockId: "",
    locationId: "",
    accommodationId: "",
    nights,
    rateSnapshot: 0,
    lineTotal: 0,
    groupTotal,
    rooms: [],
  };
}

// ------------------------------------------------------------------ pricing

export function priceUmrahQuotation(input: UmrahPricingInput): UmrahPricing {
  const issues: UmrahIssue[] = [];
  const error = (path: string, message: string) => issues.push({ severity: "error", path, message });
  const warn = (path: string, message: string) => issues.push({ severity: "warning", path, message });

  const decimals = Math.max(0, Math.round(input.currency.decimals));
  const round = (value: number): number => roundToDecimals(value, decimals);

  // ---- party
  const B = input.guest.pax;
  const W = input.guest.withoutBedPax;
  const I = input.guest.infants;
  if (!Number.isInteger(B) || B < 1) error("guest.pax", "At least one guest with a bed is needed.");
  if (!isCount(W)) error("guest.withoutBedPax", "Without-bed guests must be a whole number.");
  if (!isCount(I)) error("guest.infants", "Infants must be a whole number.");
  const beds = Math.max(1, Number.isInteger(B) ? B : 1);
  const bare = isCount(W) ? W : 0;
  const infants = isCount(I) ? I : 0;
  const paying = beds + bare;

  // ---- currencies: every one used needs a rate, never a silent fallback
  const quoteRate = rateOf(input.currency.code, input.exchangeRates);
  if (quoteRate === null) {
    error("currency", `Set an exchange rate for ${input.currency.code}.`);
  }
  const reported = new Set<string>();
  /** Multiplier from a currency's units into the quote currency's. */
  const factor = (code: string, path: string): number => {
    const rate = rateOf(code, input.exchangeRates);
    if (rate === null || quoteRate === null) {
      const key = code.trim().toUpperCase();
      if (!reported.has(key) && rate === null) {
        reported.add(key);
        error(path, `Set an exchange rate for ${code.trim().toUpperCase() || "this currency"}.`);
      }
      return 0;
    }
    return rate / quoteRate;
  };

  // ---- stays
  if (input.stays.length === 0) error("stays", "Add at least one hotel stay.");

  const stays: UmrahPricedStay[] = [];
  let totalNights = 0;
  let bedCostTotal = 0;
  let withoutBedCostTotal = 0;
  const tierBedTotal: Record<UmrahTier, number> = { Quad: 0, Triple: 0, Double: 0 };
  const tierIncomplete: Record<UmrahTier, boolean> = { Quad: false, Triple: false, Double: false };
  const tierMissingHotels: Record<UmrahTier, string[]> = { Quad: [], Triple: [], Double: [] };

  input.stays.forEach((stay, index) => {
    const at = `stays.${index}`;
    const label = stay.hotelName.trim() || `Stay ${index + 1}`;
    if (!stay.hotelName.trim()) error(`${at}.hotelName`, `Stay ${index + 1}: enter the hotel name.`);
    if (!stay.city.trim()) error(`${at}.city`, `${label}: enter the city.`);

    const from = parseIsoDate(stay.checkIn);
    const to = parseIsoDate(stay.checkOut);
    let nights = 0;
    if (from === null) error(`${at}.checkIn`, `${label}: enter a valid check-in date.`);
    if (to === null) error(`${at}.checkOut`, `${label}: enter a valid check-out date.`);
    if (from !== null && to !== null) {
      nights = nightsBetween(stay.checkIn, stay.checkOut);
      if (nights < 1) error(`${at}.checkOut`, `${label}: check-out must be after check-in.`);
      else if (nights > UMRAH_MAX_NIGHTS) {
        error(`${at}.checkOut`, `${label}: a stay cannot exceed ${UMRAH_MAX_NIGHTS} nights.`);
        nights = 0;
      }
    }
    totalNights += nights;

    const fx = factor(stay.currencyCode, `${at}.currencyCode`);

    // with-bed room cost
    let cost = 0;
    if (input.mode === "tiered") {
      for (const tier of UMRAH_TIERS) {
        const rate = stay.tierRates[tier];
        if (rate === null || rate === undefined) {
          tierIncomplete[tier] = true;
          tierMissingHotels[tier].push(label);
          continue;
        }
        if (!isMoney(rate)) {
          error(`${at}.tierRates.${tier}`, `${label}: the ${tier} rate must be a positive number.`);
          continue;
        }
        const perPersonNight = stay.rateBasis === "room" ? rate / UMRAH_TIER_CAPACITY[tier] : rate;
        tierBedTotal[tier] += beds * perPersonNight * nights * fx;
      }
    } else {
      const lines = stay.rooms;
      if (input.mode === "single" && lines.length !== 1) {
        error(`${at}.rooms`, `${label}: a single-room-type quote has exactly one room line.`);
      }
      if (lines.length === 0) error(`${at}.rooms`, `${label}: add the rooms for this stay.`);

      let seated = 0;
      lines.forEach((line, lineIndex) => {
        const lineAt = `${at}.rooms.${lineIndex}`;
        if (!line.roomType.trim()) error(`${lineAt}.roomType`, `${label}: name the room type.`);
        if (!isMoney(line.rate)) error(`${lineAt}.rate`, `${label}: the rate must be a positive number.`);
        else if (line.rate === 0) warn(`${lineAt}.rate`, `${label}: ${line.roomType || "a room"} has a zero rate.`);
        if (!isCount(line.persons)) error(`${lineAt}.persons`, `${label}: guests must be a whole number.`);
        if (!isCount(line.rooms)) error(`${lineAt}.rooms`, `${label}: rooms must be a whole number.`);
        else if (stay.rateBasis === "room" && line.rooms < 1) {
          error(`${lineAt}.rooms`, `${label}: a per-room rate needs at least one room.`);
        }
        seated += isCount(line.persons) ? line.persons : 0;
        const units = stay.rateBasis === "room" ? line.rooms : line.persons;
        if (isMoney(line.rate) && isCount(units)) cost += line.rate * units * nights * fx;
      });
      if (lines.length > 0 && seated !== beds) {
        error(
          `${at}.rooms`,
          `${label}: the rooms hold ${seated} guest${seated === 1 ? "" : "s"} but the quote has ${beds} with a bed.`,
        );
      }
    }

    // without-bed guests pay one per-person rate on every stay
    if (bare > 0) {
      if (!isMoney(stay.withoutBedRate)) {
        error(`${at}.withoutBedRate`, `${label}: the without-bed rate must be a positive number.`);
      } else {
        if (stay.withoutBedRate === 0) warn(`${at}.withoutBedRate`, `${label}: no without-bed rate set.`);
        withoutBedCostTotal += bare * stay.withoutBedRate * nights * fx;
      }
    }

    bedCostTotal += cost;
    stays.push({ nights, cost: round(cost) });
  });

  // overlapping or out-of-order stays are suspicious but legitimate (a day trip)
  for (let i = 1; i < input.stays.length; i += 1) {
    const prevOut = parseIsoDate(input.stays[i - 1]!.checkOut);
    const nextIn = parseIsoDate(input.stays[i]!.checkIn);
    if (prevOut !== null && nextIn !== null && nextIn < prevOut) {
      warn(`stays.${i}.checkIn`, `Stay ${i + 1} starts before stay ${i} ends.`);
    }
  }

  // ---- flight
  const flight = input.flight;
  let adultFare = 0;
  let infantFare = 0;
  if (flight.included) {
    const fx = factor(flight.currencyCode, "flight.currencyCode");
    if (!isMoney(flight.adultFare) || !isMoney(flight.infantFare)) {
      error("flight", "Flight fares must be positive numbers.");
    } else {
      adultFare = flight.adultFare * fx;
      infantFare = flight.infantFare * fx;
    }
  }

  // ---- transport
  let transportTotal = 0;
  input.transportLegs.forEach((leg, index) => {
    const at = `transportLegs.${index}`;
    if (!leg.route.trim()) error(`${at}.route`, `Transport ${index + 1}: choose or name the route.`);
    if (!isMoney(leg.cost)) {
      error(`${at}.cost`, `Transport ${index + 1}: the cost must be a positive number.`);
      return;
    }
    transportTotal += leg.cost * factor(leg.currencyCode, `${at}.currencyCode`);
  });

  // ---- other charges
  let perPersonCharges = 0;
  let perInfantCharges = 0;
  let perGroupCharges = 0;
  input.charges.forEach((charge, index) => {
    const at = `charges.${index}`;
    if (!charge.label.trim()) error(`${at}.label`, `Charge ${index + 1}: give it a name.`);
    if (!isMoney(charge.amount)) {
      error(`${at}.amount`, `Charge ${index + 1}: the amount must be a positive number.`);
      return;
    }
    const amount = charge.amount * factor(charge.currencyCode, `${at}.currencyCode`);
    if (charge.basis === "perPerson") perPersonCharges += amount;
    else if (charge.basis === "perInfant") perInfantCharges += amount;
    else perGroupCharges += amount;
  });

  // Group costs shared by everyone paying - a vehicle, a group fee - are spread
  // over the non-infant guests; an infant never carries a share of the van.
  const pool = (input.transportDisplay === "included" ? transportTotal : 0) + perGroupCharges;
  const share = pool / paying;
  const extraEach = adultFare + perPersonCharges + share;

  const withBedBase = extraEach * beds;
  const withoutBedGroup = withoutBedCostTotal + extraEach * bare;
  const infantGroup = infants * (infantFare + perInfantCharges);

  // ---- price lines
  const settings = new Map(input.lineSettings.map((setting) => [setting.key, setting]));
  const lines: UmrahPriceLine[] = [];

  const addLine = (key: UmrahLineKey, label: string, count: number, groupTotal: number) => {
    if (count <= 0) return;
    const setting = settings.get(key);
    const totals = calculateTotals({
      stays: [totalsStay(groupTotal, totalNights)],
      discount: setting?.discount ?? 0,
      roundOff: setting?.roundOff ?? 0,
      manualTotal: setting?.manualTotal ?? null,
      pax: count,
      exchangeRate: 1,
      decimals,
    });
    lines.push({
      key,
      label,
      count,
      groupTotal: round(groupTotal),
      subtotal: totals.subtotal,
      discount: totals.discount,
      roundOff: totals.roundOff,
      finalTotal: totals.finalTotal,
      manualOverride: totals.manualOverride,
    });
  };

  if (input.mode === "tiered") {
    let offeredAny = false;
    for (const tier of UMRAH_TIERS) {
      const setting = settings.get(tier);
      if (setting?.offered === false) continue;
      offeredAny = true;
      if (tierIncomplete[tier] && (setting?.manualTotal ?? null) === null) {
        error(
          `tiers.${tier}`,
          `${tier} has no rate for ${tierMissingHotels[tier].join(", ")}. Add it, type a price for ${tier}, or stop offering ${tier}.`,
        );
      }
      addLine(tier, tier, beds, tierBedTotal[tier] + withBedBase);
    }
    if (!offeredAny) error("tiers", "Offer at least one room type.");
    addLine("withoutBed", "Without Bed", bare, withoutBedGroup);
    addLine("infant", "Infant", infants, infantGroup);
  } else if (input.priceDisplay === "average") {
    addLine("main", "Per Person", paying, bedCostTotal + withBedBase + withoutBedGroup);
    addLine("infant", "Infant", infants, infantGroup);
  } else {
    addLine("main", bare > 0 ? "Per Person (With Bed)" : "Per Person", beds, bedCostTotal + withBedBase);
    addLine("withoutBed", "Per Person (Without Bed)", bare, withoutBedGroup);
    addLine("infant", "Per Infant", infants, infantGroup);
  }

  // The whole booking, for payments. A room-types quote has no single total, so
  // it cannot be confirmed or paid against.
  const grandTotal =
    input.mode === "tiered"
      ? 0
      : round(
          lines.reduce((sum, line) => sum + line.finalTotal * line.count, 0) +
            (input.transportDisplay === "separate" ? transportTotal : 0),
        );

  return {
    issues,
    hasErrors: umrahHasErrors(issues),
    totalNights,
    stays,
    transportTotal: round(transportTotal),
    lines,
    tierIncomplete,
    grandTotal,
    finalTotal: lines[0]?.finalTotal ?? 0,
  };
}

// ---------------------------------------------------------------- list text

/** "Name * 04 PAX + 01 WITHOUT BED + 01 INF" - the guest line as printed. */
export function umrahPartyLine(
  name: string,
  guest: { pax: number; withoutBedPax: number; infants: number },
): string {
  const two = (n: number): string => String(Math.max(0, Math.round(n))).padStart(2, "0");
  const parts = [`${two(guest.pax)} PAX`];
  if (guest.withoutBedPax > 0) parts.push(`${two(guest.withoutBedPax)} WITHOUT BED`);
  if (guest.infants > 0) parts.push(`${two(guest.infants)} INF`);
  return `${name} * ${parts.join(" + ")}`;
}

/** A quote's styled bullet lines, trimmed and emptied of blanks. */
export function cleanUmrahLines(items: Array<string | StyledLine> | undefined): StyledLine[] {
  return (items ?? [])
    .map((item) => (typeof item === "string" ? { text: item } : item))
    .map((line) => ({ text: line.text.trim(), color: line.color ?? "", bold: line.bold ?? false }))
    .filter((line) => line.text.length > 0);
}
