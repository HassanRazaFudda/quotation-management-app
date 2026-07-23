/**
 * Hijri date handling and night counts.
 *
 * Two sources of truth, in order of preference:
 *
 *  1. The Umm al-Qura calendar the admin imports. Gives exact Gregorian dates
 *     and therefore an exact night count, including months that are 29 days.
 *  2. A 30-day-month approximation, used only until a calendar is imported so
 *     the builder still works.
 *
 * Every resolved block records which of the two was used (`exact`).
 */

import {
  HIJRI_MONTHS,
  type CalendarEntry,
  type DateBlock,
  type HijriDate,
  type HijriMonth,
  type ResolvedBlock,
} from "./types";

const DAYS_PER_MONTH_ESTIMATE = 30;
const MS_PER_DAY = 86_400_000;

// -------------------------------------------------------------- formatting

export function padDay(day: number): string {
  return String(day).padStart(2, "0");
}

/** "07 Zilhaj" */
export function formatHijri(date: HijriDate): string {
  return `${padDay(date.day)} ${date.month}`;
}

/** "07 Zilhaj - 12 Zilhaj" */
export function blockLabel(block: Pick<DateBlock, "startHijri" | "endHijri">): string {
  return `${formatHijri(block.startHijri)} - ${formatHijri(block.endHijri)}`;
}

const GREGORIAN_MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** "2026-06-13" -> "13 June 2026" */
export function formatGregorian(iso: string): string {
  const parts = parseIso(iso);
  if (!parts) return iso;
  const [year, month, day] = parts;
  return `${padDay(day)} ${GREGORIAN_MONTHS[month - 1]} ${year}`;
}

/**
 * "13 June - 18 June" when both fall in the same year, otherwise both years
 * are shown. Used for the second line of the PDF's date column.
 */
export function formatGregorianRange(startIso: string, endIso: string): string {
  const start = parseIso(startIso);
  const end = parseIso(endIso);
  if (!start || !end) return `${startIso} - ${endIso}`;

  const sameYear = start[0] === end[0];
  const left = sameYear
    ? `${padDay(start[2])} ${GREGORIAN_MONTHS[start[1] - 1]}`
    : formatGregorian(startIso);
  return `${left} - ${formatGregorian(endIso)}`;
}

// ----------------------------------------------------------------- parsing

/** Strict "YYYY-MM-DD" parse. Returns [year, month, day] or null. */
function parseIso(iso: string): [number, number, number] | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return [year, month, day];
}

/** Whole days between two ISO dates. Timezone-free: everything is UTC. */
export function daysBetween(startIso: string, endIso: string): number | null {
  const start = parseIso(startIso);
  const end = parseIso(endIso);
  if (!start || !end) return null;
  const a = Date.UTC(start[0], start[1] - 1, start[2]);
  const b = Date.UTC(end[0], end[1] - 1, end[2]);
  return Math.round((b - a) / MS_PER_DAY);
}

// ----------------------------------------------------------------- ordering

/**
 * A comparable day number inside a Hijri year, using 30-day months.
 * Only used for ordering and for the estimate; never for exact nights.
 */
export function hijriIndex(date: HijriDate): number {
  const month = HIJRI_MONTHS.indexOf(date.month);
  return month * DAYS_PER_MONTH_ESTIMATE + date.day;
}

// ------------------------------------------------------------ calendar map

export type CalendarIndex = Map<string, string>;

function calendarKey(year: number | string, month: HijriMonth, day: number): string {
  return `${year}|${month}|${day}`;
}

/** Build a lookup so resolving many blocks stays O(1) per date. */
export function indexCalendar(entries: CalendarEntry[]): CalendarIndex {
  const index: CalendarIndex = new Map();
  for (const entry of entries) {
    index.set(calendarKey(entry.hijriYear, entry.month, entry.day), entry.gregorian);
  }
  return index;
}

export function lookupGregorian(
  index: CalendarIndex,
  season: string,
  date: HijriDate,
): string | null {
  return index.get(calendarKey(season, date.month, date.day)) ?? null;
}

// ------------------------------------------------------------- resolution

/**
 * Nights when no calendar is available: difference in 30-day-month indices,
 * rolling over if the block crosses into the next Hijri year.
 */
export function estimateNights(start: HijriDate, end: HijriDate): number {
  const startIndex = hijriIndex(start);
  let endIndex = hijriIndex(end);
  if (endIndex < startIndex) {
    endIndex += HIJRI_MONTHS.length * DAYS_PER_MONTH_ESTIMATE; // crossed the year
  }
  return endIndex - startIndex;
}

/** Attach labels, Gregorian dates and a night count to a date block. */
export function resolveBlock(block: DateBlock, index: CalendarIndex): ResolvedBlock {
  const startGregorian = lookupGregorian(index, block.season, block.startHijri);
  const endGregorian = lookupGregorian(index, block.season, block.endHijri);

  let nights = estimateNights(block.startHijri, block.endHijri);
  let exact = false;

  if (startGregorian && endGregorian) {
    const diff = daysBetween(startGregorian, endGregorian);
    if (diff !== null && diff > 0) {
      nights = diff;
      exact = true;
    }
  }

  return {
    ...block,
    label: blockLabel(block),
    startGregorian,
    endGregorian,
    gregorianLabel:
      startGregorian && endGregorian
        ? formatGregorianRange(startGregorian, endGregorian)
        : null,
    nights,
    exact,
  };
}

export function resolveBlocks(
  blocks: DateBlock[],
  calendar: CalendarEntry[],
): ResolvedBlock[] {
  const index = indexCalendar(calendar);
  return blocks
    .map((block) => resolveBlock(block, index))
    .sort((a, b) => hijriIndex(a.startHijri) - hijriIndex(b.startHijri));
}
