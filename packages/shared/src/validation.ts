/**
 * Itinerary validation.
 *
 * Two jobs:
 *
 *  1. Catch mistakes the staff member can still make — gaps between stays,
 *     overlapping dates, a missing or wrong Hajj block.
 *  2. Enforce the admin's configuration — a location must be allowed for the
 *     block, an accommodation must belong to that location, and the meal must
 *     be one the admin permitted for that accommodation.
 *
 * The builder calls this on every change; the API calls the same function
 * before saving.
 */

import { hijriIndex } from "./calendar";
import type {
  Accommodation,
  Location,
  Meal,
  MealNote,
  ResolvedBlock,
  StayInput,
} from "./types";

export type IssueSeverity = "error" | "warning";

export interface Issue {
  severity: IssueSeverity;
  code:
    | "NO_STAYS"
    | "UNKNOWN_REFERENCE"
    | "LOCATION_NOT_ALLOWED"
    | "ACCOMMODATION_MISMATCH"
    | "MEAL_NOT_ALLOWED"
    | "MEAL_NOTE_NOT_ALLOWED"
    | "MISSING_ROOM_TYPE"
    | "UNEXPECTED_ROOM_TYPE"
    | "OCCUPANCY_NOT_ALLOWED"
    | "MISSING_TIER"
    | "GAP"
    | "OVERLAP"
    | "NO_HAJJ_BLOCK"
    | "MULTIPLE_HAJJ_BLOCKS"
    | "HAJJ_BLOCK_MISALIGNED"
    | "HAJJ_BLOCK_NOT_EXPECTED";
  message: string;
  /** Index into the stays array, when the issue belongs to one row. */
  stayIndex?: number;
}

export interface ValidationContext {
  blocks: Map<string, ResolvedBlock>;
  locations: Map<string, Location>;
  accommodations: Map<string, Accommodation>;
  meals: Map<string, Meal>;
  mealNotes: Map<string, MealNote>;
  /**
   * The package does not book Mina, so the Hajj days are left uncovered on
   * purpose and no Hajj block is expected.
   */
  withoutMina?: boolean;
}

export function makeValidationContext(input: {
  blocks: ResolvedBlock[];
  locations: Location[];
  accommodations: Accommodation[];
  meals: Meal[];
  mealNotes: MealNote[];
  withoutMina?: boolean;
}): ValidationContext {
  return {
    blocks: new Map(input.blocks.map((b) => [b.id, b])),
    locations: new Map(input.locations.map((l) => [l.id, l])),
    accommodations: new Map(input.accommodations.map((a) => [a.id, a])),
    meals: new Map(input.meals.map((m) => [m.id, m])),
    mealNotes: new Map(input.mealNotes.map((n) => [n.id, n])),
    withoutMina: input.withoutMina ?? false,
  };
}

export function validateItinerary(
  stays: StayInput[],
  context: ValidationContext,
): Issue[] {
  const issues: Issue[] = [];

  if (stays.length === 0) {
    return [{ severity: "error", code: "NO_STAYS", message: "No stays added yet." }];
  }

  stays.forEach((stay, index) => {
    issues.push(...validateStay(stay, index, context));
  });

  issues.push(...validateDateCoverage(stays, context));
  issues.push(...validateHajjBlock(stays, context));

  return issues;
}

// --------------------------------------------------------------- one stay

function validateStay(
  stay: StayInput,
  index: number,
  context: ValidationContext,
): Issue[] {
  const issues: Issue[] = [];
  const at = (code: Issue["code"], message: string, severity: IssueSeverity = "error") =>
    issues.push({ severity, code, message, stayIndex: index });

  const block = context.blocks.get(stay.blockId);
  const accommodation = context.accommodations.get(stay.accommodationId);
  const location = context.locations.get(stay.locationId);

  if (!block || !accommodation || !location) {
    at("UNKNOWN_REFERENCE", `Row ${index + 1}: a selected item no longer exists.`);
    return issues;
  }

  const rowName = `Row ${index + 1} (${block.label})`;

  if (!block.allowedLocationIds.includes(location.id)) {
    at(
      "LOCATION_NOT_ALLOWED",
      `${rowName}: ${location.name} is not allowed for this date block.`,
    );
  }

  if (accommodation.locationId !== location.id) {
    at(
      "ACCOMMODATION_MISMATCH",
      `${rowName}: ${accommodation.name} does not belong to ${location.name}.`,
    );
  }

  // Every stay except a Mina tent needs a room choice. A Separate room also
  // needs its size; Sharing deliberately has none - a shared room may be four,
  // five or six people.
  if (location.pricingModel === "flat") {
    if (stay.roomType) {
      at("UNEXPECTED_ROOM_TYPE", `${rowName}: a tent has no room type.`, "warning");
    }
  } else if (!stay.roomType) {
    at("MISSING_ROOM_TYPE", `${rowName}: choose a room.`);
  } else if (stay.roomType === "separate" && !stay.occupancy) {
    at("MISSING_ROOM_TYPE", `${rowName}: a Separate room needs Triple or Double.`);
  }

  // A hotel only has the room sizes the admin recorded for it.
  const allowedOccupancies = accommodation.allowedOccupancies ?? [];
  if (stay.occupancy && allowedOccupancies.length > 0 && !allowedOccupancies.includes(stay.occupancy)) {
    at(
      "OCCUPANCY_NOT_ALLOWED",
      `${rowName}: ${accommodation.name} has no ${stay.occupancy} rooms.`,
    );
  }

  // Without Mina is a Mina option that books no tent, so it has no tier.
  if (location.type === "mina" && !accommodation.minaTier && !accommodation.withoutMina) {
    at("MISSING_TIER", `${rowName}: this Mina option has no tier configured.`);
  }

  if (stay.mealId && !accommodation.allowedMealIds.includes(stay.mealId)) {
    const meal = context.meals.get(stay.mealId);
    at(
      "MEAL_NOT_ALLOWED",
      `${rowName}: "${meal?.label ?? stay.mealId}" is not available at ${accommodation.name}.`,
    );
  }

  if (stay.mealNoteId && !accommodation.allowedMealNoteIds.includes(stay.mealNoteId)) {
    const note = context.mealNotes.get(stay.mealNoteId);
    at(
      "MEAL_NOTE_NOT_ALLOWED",
      `${rowName}: "${note?.label ?? stay.mealNoteId}" is not available at ${accommodation.name}.`,
    );
  }

  return issues;
}

// ----------------------------------------------------------- date coverage

interface Span {
  block: ResolvedBlock;
  start: number;
  end: number;
}

/**
 * Every stay counts here, Mina included. Leaving a booked stay out would
 * report the days it covers as a hole in the itinerary.
 */
function spansOf(stays: StayInput[], context: ValidationContext): Span[] {
  const spans: Span[] = [];

  for (const stay of stays) {
    const block = context.blocks.get(stay.blockId);
    if (!block) continue;

    spans.push({
      block,
      start: hijriIndex(block.startHijri),
      end: hijriIndex(block.endHijri),
    });
  }

  return spans.sort((a, b) => a.start - b.start);
}

/**
 * Are these the days a Hajj block would have covered?
 *
 * A package sold without Mina leaves exactly that stretch open on purpose -
 * the guest is in Mina with someone else - so it is not a mistake to report.
 */
function isTheHajjDays(context: ValidationContext, from: number, to: number): boolean {
  for (const block of context.blocks.values()) {
    if (block.phase !== "hajj") continue;
    if (hijriIndex(block.startHijri) === from && hijriIndex(block.endHijri) === to) {
      return true;
    }
  }
  return false;
}

function validateDateCoverage(
  stays: StayInput[],
  context: ValidationContext,
): Issue[] {
  const issues: Issue[] = [];
  const spans = spansOf(stays, context);

  for (let i = 0; i + 1 < spans.length; i++) {
    const current = spans[i]!;
    const next = spans[i + 1]!;

    if (next.start < current.end) {
      issues.push({
        severity: "error",
        code: "OVERLAP",
        message:
          `"${current.block.label}" and "${next.block.label}" cover the same days.`,
      });
    } else if (next.start > current.end) {
      if (context.withoutMina && isTheHajjDays(context, current.end, next.start)) continue;

      issues.push({
        severity: "warning",
        code: "GAP",
        message:
          `Gap between "${current.block.label}" and "${next.block.label}" — ` +
          "no stay covers the days in between.",
      });
    }
  }

  return issues;
}

// ------------------------------------------------------------- Hajj block

/**
 * The Hajj block must begin exactly where the last pre-Hajj stay ends.
 *
 * This replaces the desktop app's hard-coded rule (08 Zilhaj -> 4 nights,
 * 07 Zilhaj -> 5 nights): the same outcome now falls out of whichever blocks
 * the admin has configured.
 */
export function suggestHajjBlock(
  stays: StayInput[],
  context: ValidationContext,
): ResolvedBlock | null {
  let latestEnd: number | null = null;

  for (const stay of stays) {
    const block = context.blocks.get(stay.blockId);
    if (!block || block.phase !== "pre") continue;
    const end = hijriIndex(block.endHijri);
    if (latestEnd === null || end > latestEnd) latestEnd = end;
  }

  if (latestEnd === null) return null;

  for (const block of context.blocks.values()) {
    if (block.phase === "hajj" && hijriIndex(block.startHijri) === latestEnd) {
      return block;
    }
  }
  return null;
}

function validateHajjBlock(
  stays: StayInput[],
  context: ValidationContext,
): Issue[] {
  const chosen = stays
    .map((stay) => context.blocks.get(stay.blockId))
    .filter((block): block is ResolvedBlock => !!block && block.phase === "hajj");

  /*
   * A package sold without Mina normally still books the Hajj days - the
   * Muallim, the transport and Arafat are charged even when no tent is - so
   * the Hajj block is welcome. What it must not hold is a real tent.
   *
   * An agency that leaves the days out entirely is allowed too: no Hajj block
   * is demanded, and the hole it leaves is not reported as a gap.
   */
  if (context.withoutMina) {
    const tent = stays.find((stay) => {
      const block = context.blocks.get(stay.blockId);
      if (block?.phase !== "hajj") return false;
      return Boolean(context.accommodations.get(stay.accommodationId)?.minaTier);
    });

    if (!tent) return [];
    const accommodation = context.accommodations.get(tent.accommodationId);
    return [
      {
        severity: "error",
        code: "HAJJ_BLOCK_NOT_EXPECTED",
        message:
          `This package is set to "Without Mina", but the Hajj days still book ` +
          `${accommodation?.name ?? "a tent"}.`,
      },
    ];
  }

  if (chosen.length === 0) {
    return [
      {
        severity: "error",
        code: "NO_HAJJ_BLOCK",
        message: "No Hajj block selected.",
      },
    ];
  }

  if (chosen.length > 1) {
    return [
      {
        severity: "error",
        code: "MULTIPLE_HAJJ_BLOCKS",
        message: "More than one Hajj block selected.",
      },
    ];
  }

  const expected = suggestHajjBlock(stays, context);
  const actual = chosen[0]!;

  if (expected && expected.id !== actual.id) {
    return [
      {
        severity: "error",
        code: "HAJJ_BLOCK_MISALIGNED",
        message:
          `Hajj block is "${actual.label}", but the stay before it ends where ` +
          `"${expected.label}" begins.`,
      },
    ];
  }

  return [];
}

// ----------------------------------------------------- block continuation

/**
 * The blocks that may follow the stays already chosen.
 *
 * An itinerary is a chain: a stay ending on 30 Zilqad is followed by one
 * starting on 30 Zilqad. Offering only those removes the possibility of a gap
 * or an overlap rather than reporting it afterwards.
 *
 * With nothing chosen yet, every block is a valid starting point.
 */
export function nextBlockOptions(
  chosenBlockIds: string[],
  blocks: ResolvedBlock[],
): ResolvedBlock[] {
  const chosen = chosenBlockIds
    .map((id) => blocks.find((block) => block.id === id))
    .filter((block): block is ResolvedBlock => Boolean(block));

  if (chosen.length === 0) return blocks;

  const furthestEnd = Math.max(...chosen.map((block) => hijriIndex(block.endHijri)));
  const used = new Set(chosenBlockIds);

  return blocks.filter(
    (block) => !used.has(block.id) && hijriIndex(block.startHijri) === furthestEnd,
  );
}

// ------------------------------------------------------------- convenience

export const hasErrors = (issues: Issue[]): boolean =>
  issues.some((issue) => issue.severity === "error");

export const errorsOnly = (issues: Issue[]): Issue[] =>
  issues.filter((issue) => issue.severity === "error");
