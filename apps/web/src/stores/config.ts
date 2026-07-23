/**
 * The configuration bundle that drives the builder: date blocks, locations,
 * accommodations, meals, services, rates and the calendar. Fetched once and
 * kept in memory, with helpers that answer the questions the builder asks -
 * "which locations can this block use?", "which meals does this hotel offer?".
 */

import {
  resolveBlocks,
  type Accommodation,
  type Location,
  type Meal,
  type MealNote,
  type FlightOption,
  type PackageCategory,
  type Rate,
  type ResolvedBlock,
  type ServiceItem,
} from "@junaidi/shared";
import { create } from "zustand";

import { api } from "@/lib/api";
import type { BootstrapResponse, ConfigProblem } from "@/lib/types";

interface ConfigState {
  season: string;
  loaded: boolean;
  loading: boolean;
  error: string | null;

  blocks: ResolvedBlock[];
  locations: Location[];
  accommodations: Accommodation[];
  meals: Meal[];
  mealNotes: MealNote[];
  services: ServiceItem[];
  packageCategories: PackageCategory[];
  flights: FlightOption[];
  rates: Rate[];
  problems: ConfigProblem[];

  load: (season?: string, force?: boolean) => Promise<void>;
}

export const useConfigStore = create<ConfigState>((set, get) => ({
  season: "1448",
  loaded: false,
  loading: false,
  error: null,

  blocks: [],
  locations: [],
  accommodations: [],
  meals: [],
  mealNotes: [],
  services: [],
  packageCategories: [],
  flights: [],
  rates: [],
  problems: [],

  load: async (season, force) => {
    const target = season ?? get().season;
    if (get().loading) return;
    if (get().loaded && !force && target === get().season) return;

    set({ loading: true, error: null });
    try {
      const data = await api.get<BootstrapResponse>(`/api/config/bootstrap?season=${target}`);
      set({
        season: target,
        // Resolve blocks up front so nights and Gregorian dates are ready.
        blocks: resolveBlocks(data.blocks, data.calendar),
        locations: data.locations,
        accommodations: data.accommodations,
        meals: data.meals,
        mealNotes: data.mealNotes,
        services: data.services,
        packageCategories: data.packageCategories ?? [],
        flights: data.flights ?? [],
        rates: data.rates,
        problems: data.problems ?? [],
        loaded: true,
        loading: false,
      });
    } catch (err) {
      set({ loading: false, error: err instanceof Error ? err.message : "Failed to load configuration." });
    }
  },
}));

// -------------------------------------------------------------- selectors

/** Active locations the admin allowed for a given block. */
export function locationsForBlock(state: ConfigState, blockId: string): Location[] {
  const block = state.blocks.find((b) => b.id === blockId);
  if (!block) return [];
  const allowed = new Set(block.allowedLocationIds);
  return state.locations.filter((l) => allowed.has(l.id));
}

export function accommodationsForLocation(state: ConfigState, locationId: string): Accommodation[] {
  return state.accommodations.filter((a) => a.locationId === locationId);
}

export function mealsForAccommodation(state: ConfigState, accommodationId: string): Meal[] {
  const acc = state.accommodations.find((a) => a.id === accommodationId);
  if (!acc) return [];
  const allowed = new Set(acc.allowedMealIds);
  return state.meals.filter((m) => allowed.has(m.id));
}

export function mealNotesForAccommodation(state: ConfigState, accommodationId: string): MealNote[] {
  const acc = state.accommodations.find((a) => a.id === accommodationId);
  if (!acc) return [];
  const allowed = new Set(acc.allowedMealNoteIds);
  return state.mealNotes.filter((n) => allowed.has(n.id));
}

export function servicesByCategory(state: ConfigState, category: string): ServiceItem[] {
  return state.services.filter((s) => s.category === category);
}
