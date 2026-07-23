/**
 * Air travel.
 *
 * A package may be quoted with or without flights. When it includes them the
 * itinerary already fixes the dates, so what remains is the routing: which city
 * the guest flies into (Jeddah for a Makkah-first package, Madinah otherwise),
 * whether a return is wanted at all, and which city they fly home from.
 *
 * Admin maintains the available sectors and their fares; staff pick from them.
 */

import type { LabelledItem } from "./types";

export const FLIGHT_CITIES = ["Jeddah", "Madinah"] as const;
export type FlightCity = (typeof FLIGHT_CITIES)[number];

/**
 * `outbound` / `inbound` are one-way sectors, summed by the staff.
 * `roundtrip` is a single two-way ticket at one negotiated fare - the common
 * Pakistani "return ticket", usually cheaper than two one-ways.
 */
export const FLIGHT_DIRECTIONS = ["outbound", "inbound", "roundtrip"] as const;
export type FlightDirection = (typeof FLIGHT_DIRECTIONS)[number];

/** One flight an admin has made available, with its fare. */
export interface FlightOption extends LabelledItem {
  season: string;
  direction: FlightDirection;
  /** Departure city, e.g. "Karachi" outbound, "Jeddah" inbound. */
  origin: string;
  /** Arrival city, e.g. "Jeddah" outbound, "Karachi" inbound. */
  destination: string;
  /**
   * Round-trip only: the city the return leg departs from. The guest can fly
   * into Madinah and home from Jeddah. Empty means the return mirrors the
   * outbound (home from the same city they arrived in).
   */
  returnFrom?: string;
  airline: string;
  /** Fare per person: one sector for a one-way, both legs for a round-trip. */
  price: number;
}

/** What a quotation records about flights. */
export interface FlightSelection {
  included: boolean;
  /**
   * The package uses a single two-way ticket rather than separate sectors. The
   * separate sector choices are then ignored.
   */
  roundTrip?: boolean;
  roundTripId?: string | null;
  /** Chosen outbound sector, if any. */
  outboundId?: string | null;
  /** A one-way package is common; the return is optional. */
  returnRequired: boolean;
  inboundId?: string | null;
}

/** The sector as frozen onto a saved quotation. */
export interface FlightSnapshot {
  optionId: string;
  label: string;
  airline: string;
  origin: string;
  destination: string;
  price: number;
}

export interface PricedFlights {
  included: boolean;
  outbound: FlightSnapshot | null;
  inbound: FlightSnapshot | null;
  total: number;
  issues: string[];
}

const toSnapshot = (option: FlightOption): FlightSnapshot => ({
  optionId: option.id,
  label: option.label,
  airline: option.airline,
  origin: option.origin,
  destination: option.destination,
  price: option.price,
});

/**
 * Resolve a selection against the available sectors and total the fares.
 * Reports problems rather than throwing, so the builder can show them inline.
 */
export function priceFlights(
  selection: FlightSelection | undefined,
  options: FlightOption[],
): PricedFlights {
  const empty: PricedFlights = {
    included: false,
    outbound: null,
    inbound: null,
    total: 0,
    issues: [],
  };

  if (!selection?.included) return empty;

  const byId = new Map(options.map((option) => [option.id, option]));
  const issues: string[] = [];

  // A round-trip is one product covering both legs at a single fare. When the
  // package uses one, the separate sectors are ignored.
  if (selection.roundTrip) {
    const option = selection.roundTripId ? byId.get(selection.roundTripId) : undefined;
    if (!option) {
      return { included: true, outbound: null, inbound: null, total: 0,
        issues: ["Choose a round-trip flight."] };
    }
    const back = option.returnFrom || option.destination;
    return {
      included: true,
      // The fare belongs to the ticket as a whole; it sits on the outbound
      // snapshot so `total` stays the sum of the two legs.
      outbound: toSnapshot(option),
      inbound: {
        optionId: option.id,
        label: `${back} - ${option.origin}${option.airline ? ` (${option.airline})` : ""}`,
        airline: option.airline,
        origin: back,
        destination: option.origin,
        price: 0,
      },
      total: option.price,
      issues: [],
    };
  }

  const outboundOption = selection.outboundId ? byId.get(selection.outboundId) : undefined;
  if (!outboundOption) issues.push("Choose an outbound flight.");

  let inboundOption: FlightOption | undefined;
  if (selection.returnRequired) {
    inboundOption = selection.inboundId ? byId.get(selection.inboundId) : undefined;
    if (!inboundOption) issues.push("Choose a return flight, or turn the return off.");
  }

  const outbound = outboundOption ? toSnapshot(outboundOption) : null;
  const inbound = inboundOption ? toSnapshot(inboundOption) : null;

  return {
    included: true,
    outbound,
    inbound,
    total: (outbound?.price ?? 0) + (inbound?.price ?? 0),
    issues,
  };
}

/** "Karachi - Jeddah (PIA)" */
export function flightLabel(option: Pick<FlightOption, "origin" | "destination" | "airline">): string {
  const route = `${option.origin} - ${option.destination}`;
  return option.airline ? `${route} (${option.airline})` : route;
}

/**
 * "Karachi <-> Jeddah (PIA)" when the return mirrors the outbound, otherwise
 * both legs are spelled out: "Karachi - Madinah / Jeddah - Karachi (PIA)".
 */
export function roundTripLabel(
  option: Pick<FlightOption, "origin" | "destination" | "returnFrom" | "airline">,
): string {
  const back = option.returnFrom || option.destination;
  const airline = option.airline ? ` (${option.airline})` : "";
  const route =
    back === option.destination
      ? `${option.origin} <-> ${option.destination}`
      : `${option.origin} - ${option.destination} / ${back} - ${option.origin}`;
  return `${route}${airline}`;
}

/** The label for any flight, round-trip or one-way sector. */
export function anyFlightLabel(
  option: Pick<FlightOption, "direction" | "origin" | "destination" | "returnFrom" | "airline">,
): string {
  return option.direction === "roundtrip" ? roundTripLabel(option) : flightLabel(option);
}
