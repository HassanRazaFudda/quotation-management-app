/**
 * The configuration bundle.
 *
 * The builder needs blocks, locations, accommodations, meals, services, rates
 * and the calendar before it can render a single dropdown or price anything.
 * Fetching them one at a time would mean seven round trips on page load, so
 * they are read in parallel and returned as one payload the client can cache.
 */

import {
  anyFlightLabel,
  type Accommodation,
  type CalendarEntry,
  type ConfigBundle,
  type DateBlock,
  type FlightOption,
  type Location,
  type Meal,
  type MealNote,
  type Rate,
  type ServiceItem,
} from "@junaidi/shared";

import {
  AccommodationModel,
  CalendarEntryModel,
  DateBlockModel,
  FlightModel,
  LocationModel,
  MealModel,
  MealNoteModel,
  PackageCategoryModel,
  RateModel,
  ServiceItemModel,
} from "../models/config";

const id = (value: unknown): string => String(value);

/** Only active rows reach staff; inactive ones stay for historical quotations. */
const activeOnly = { active: true } as const;

export async function getConfigBundle(season: string): Promise<ConfigBundle> {
  const [
    blocks, locations, accommodations, meals, mealNotes,
    services, categories, rates, calendar, flights,
  ] = await Promise.all([
      DateBlockModel.find({ ...activeOnly, season }).sort({ sortOrder: 1 }).lean(),
      LocationModel.find(activeOnly).sort({ sortOrder: 1 }).lean(),
      AccommodationModel.find(activeOnly).sort({ sortOrder: 1 }).lean(),
      MealModel.find(activeOnly).sort({ sortOrder: 1 }).lean(),
      MealNoteModel.find(activeOnly).sort({ sortOrder: 1 }).lean(),
      ServiceItemModel.find(activeOnly).sort({ category: 1, sortOrder: 1 }).lean(),
      PackageCategoryModel.find(activeOnly).sort({ sortOrder: 1 }).lean(),
      RateModel.find({ season }).lean(),
      CalendarEntryModel.find({ hijriYear: Number(season) }).lean(),
      FlightModel.find({ ...activeOnly, season }).sort({ direction: 1, sortOrder: 1 }).lean(),
    ]);

  return {
    season,
    blocks: blocks.map(toDateBlock),
    locations: locations.map(toLocation),
    accommodations: accommodations.map(toAccommodation),
    meals: meals.map(toLabelled),
    mealNotes: mealNotes.map(toLabelled),
    services: services.map(toServiceItem),
    packageCategories: categories.map(toLabelled),
    flights: flights.map(toFlight),
    rates: rates.map(toRate),
    calendar: calendar.map(toCalendarEntry),
  };
}

// ------------------------------------------------------------- converters
// Mongo documents carry ObjectIds and Mongoose internals; the shared domain
// types are plain data. Everything crosses that boundary here.

function toLocation(doc: Record<string, any>): Location {
  return {
    id: id(doc._id),
    name: doc.name,
    type: doc.type,
    pricingModel: doc.pricingModel,
    sortOrder: doc.sortOrder ?? 0,
    active: doc.active ?? true,
  };
}

function toAccommodation(doc: Record<string, any>): Accommodation {
  return {
    id: id(doc._id),
    locationId: id(doc.locationId),
    name: doc.name,
    minaTier: doc.minaTier ?? null,
    bedsPerTent: doc.bedsPerTent ?? null,
    withoutMina: doc.withoutMina ?? false,
    allowedOccupancies: doc.allowedOccupancies ?? [],
    allowedSharingWords: doc.allowedSharingWords ?? [],
    allowedCategories: (doc.allowedCategories ?? []).map(id),
    allowedMealIds: (doc.allowedMealIds ?? []).map(id),
    allowedMealNoteIds: (doc.allowedMealNoteIds ?? []).map(id),
    sortOrder: doc.sortOrder ?? 0,
    active: doc.active ?? true,
  };
}

function toLabelled(doc: Record<string, any>): Meal | MealNote {
  return {
    id: id(doc._id),
    label: doc.label,
    sortOrder: doc.sortOrder ?? 0,
    active: doc.active ?? true,
  };
}

function toServiceItem(doc: Record<string, any>): ServiceItem {
  return {
    id: id(doc._id),
    label: doc.label,
    category: doc.category,
    defaultSelected: doc.defaultSelected ?? true,
    sortOrder: doc.sortOrder ?? 0,
    active: doc.active ?? true,
  };
}

function toDateBlock(doc: Record<string, any>): DateBlock {
  return {
    id: id(doc._id),
    season: doc.season,
    startHijri: { month: doc.startHijri.month, day: doc.startHijri.day },
    endHijri: { month: doc.endHijri.month, day: doc.endHijri.day },
    phase: doc.phase,
    allowedLocationIds: (doc.allowedLocationIds ?? []).map(id),
    sortOrder: doc.sortOrder ?? 0,
    active: doc.active ?? true,
  };
}

function toRate(doc: Record<string, any>): Rate {
  const base = {
    accommodationId: id(doc.accommodationId),
    blockId: id(doc.blockId),
    season: doc.season,
  };

  switch (doc.model) {
    case "flat":
      return { ...base, model: "flat", amount: doc.amount ?? 0 };
    case "sharingOrSeparate":
      return {
        ...base,
        model: "sharingOrSeparate",
        sharing: doc.sharing ?? 0,
        separate: doc.separate ?? { Quad: 0, Triple: 0, Double: 0 },
      };
    default:
      return { ...base, model: "byOccupancy", rates: doc.rates };
  }
}

function toFlight(doc: Record<string, any>): FlightOption {
  return {
    id: id(doc._id),
    season: doc.season,
    direction: doc.direction,
    origin: doc.origin,
    destination: doc.destination,
    returnFrom: doc.returnFrom ?? "",
    airline: doc.airline ?? "",
    price: doc.price ?? 0,
    // Kept in sync with the route so the UI never has to build it.
    label: anyFlightLabel(doc as Parameters<typeof anyFlightLabel>[0]),
    sortOrder: doc.sortOrder ?? 0,
    active: doc.active ?? true,
  };
}

function toCalendarEntry(doc: Record<string, any>): CalendarEntry {
  return {
    hijriYear: doc.hijriYear,
    month: doc.month,
    day: doc.day,
    gregorian: doc.gregorian,
  };
}

// --------------------------------------------------------------- integrity

export interface ConfigProblem {
  kind:
    | "MISSING_RATE"
    | "RATE_MODEL_MISMATCH"
    | "BLOCK_WITHOUT_LOCATIONS"
    | "LOCATION_WITHOUT_ACCOMMODATION"
    | "ACCOMMODATION_WITHOUT_MEALS"
    | "NO_CALENDAR";
  message: string;
}

/**
 * Problems that would leave staff unable to build a quotation. Surfaced on the
 * admin dashboard so misconfiguration is caught by the admin rather than
 * discovered by a staff member with a customer waiting.
 */
export function findConfigProblems(bundle: ConfigBundle): ConfigProblem[] {
  const problems: ConfigProblem[] = [];
  const locationById = new Map(bundle.locations.map((l) => [l.id, l]));
  const rateByKey = new Map(
    bundle.rates.map((r) => [`${r.accommodationId}:${r.blockId}`, r]),
  );

  const blockLabel = (block: (typeof bundle.blocks)[number]) =>
    `${String(block.startHijri.day).padStart(2, "0")} ${block.startHijri.month} - ` +
    `${String(block.endHijri.day).padStart(2, "0")} ${block.endHijri.month}`;

  for (const accommodation of bundle.accommodations) {
    const location = locationById.get(accommodation.locationId);

    // A rate is needed for every block this accommodation can actually be used in.
    const usableBlocks = bundle.blocks.filter((block) =>
      block.allowedLocationIds.includes(accommodation.locationId),
    );

    for (const block of usableBlocks) {
      const rate = rateByKey.get(`${accommodation.id}:${block.id}`);
      if (!rate) {
        problems.push({
          kind: "MISSING_RATE",
          message: `"${accommodation.name}" has no rate for ${blockLabel(block)}.`,
        });
      } else if (location && rate.model !== location.pricingModel) {
        problems.push({
          kind: "RATE_MODEL_MISMATCH",
          message:
            `"${accommodation.name}" is priced as ${rate.model} but ${location.name} ` +
            `uses ${location.pricingModel}.`,
        });
      }
    }

    if (accommodation.allowedMealIds.length === 0) {
      problems.push({
        kind: "ACCOMMODATION_WITHOUT_MEALS",
        message: `"${accommodation.name}" has no meal plans enabled.`,
      });
    }
  }

  for (const block of bundle.blocks) {
    if (block.allowedLocationIds.length === 0) {
      problems.push({
        kind: "BLOCK_WITHOUT_LOCATIONS",
        message: `Date block "${block.startHijri.day} ${block.startHijri.month} - ${block.endHijri.day} ${block.endHijri.month}" allows no locations, so staff cannot use it.`,
      });
    }
  }

  const withAccommodation = new Set(bundle.accommodations.map((a) => a.locationId));
  for (const location of bundle.locations) {
    if (!withAccommodation.has(location.id)) {
      problems.push({
        kind: "LOCATION_WITHOUT_ACCOMMODATION",
        message: `${location.name} has no accommodation configured.`,
      });
    }
  }

  if (bundle.calendar.length === 0) {
    problems.push({
      kind: "NO_CALENDAR",
      message:
        `No Hijri calendar imported for ${bundle.season}. Night counts will be ` +
        "estimated at 30 days per month until one is uploaded.",
    });
  }

  return problems;
}
