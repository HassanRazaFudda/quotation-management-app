/**
 * The configuration bundle that drives the builder: date blocks, locations,
 * accommodations, meals, services, rates and the calendar. Fetched once and
 * kept in memory, with helpers that answer the questions the builder asks -
 * "which locations can this block use?", "which meals does this hotel offer?".
 */

import {
  resolveBlocks,
  type Accommodation,
  type Currency,
  type Location,
  type Meal,
  type MealNote,
  type FlightOption,
  type PackageCategory,
  type Rate,
  type ResolvedBlock,
  type RoomSize,
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
  currencies: Currency[];
  roomSizes: RoomSize[];
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
  currencies: [],
  roomSizes: [],
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
        currencies: data.currencies ?? [],
        roomSizes: data.roomSizes ?? [],
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

/**
 * A location's hotels, narrowed to the ones actually offered for a given
 * block when one is known - a hotel with a non-empty `allowedBlockIds` that
 * excludes it is left out, same as it would be excluded from the admin
 * screens.
 */
export function accommodationsForLocation(
  state: ConfigState,
  locationId: string,
  blockId?: string,
): Accommodation[] {
  return state.accommodations.filter((a) => {
    if (a.locationId !== locationId) return false;
    if (!blockId || !a.allowedBlockIds?.length) return true;
    return a.allowedBlockIds.includes(blockId);
  });
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

/** How many people each sharing word means, for `roomChoices`/`sharingWordsFor`. */
export function wordSizeMap(state: ConfigState): Record<string, number> {
  const map: Record<string, number> = {};
  for (const size of state.roomSizes) {
    if (size.sharingGroupSize) map[size.code] = size.sharingGroupSize;
  }
  return map;
}
