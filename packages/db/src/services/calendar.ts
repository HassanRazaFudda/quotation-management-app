/**
 * Importing the Hijri calendar.
 *
 * Hijri months are 29 or 30 days and which one is only known from the
 * published calendar. Assuming 30 gets night counts wrong: for 1448,
 * Zilqad is 29 days, so "25 Zilqad - 01 Zilhaj" is 5 nights, not the 6 a
 * flat estimate produces. Wrong nights means a wrong price.
 *
 * A month is stored as its first Gregorian date plus its length, which is the
 * compact form every published calendar gives. `expandMonths` turns that into
 * one row per day for O(1) lookup.
 */

import type { CalendarEntry, HijriMonth } from "@junaidi/shared";

import { CalendarEntryModel } from "../models/config";

export interface HijriMonthDefinition {
  hijriYear: number;
  month: HijriMonth;
  /** Gregorian date of the 1st, "YYYY-MM-DD". */
  startGregorian: string;
  /** 29 or 30. */
  length: number;
}

export class CalendarImportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CalendarImportError";
  }
}

const MS_PER_DAY = 86_400_000;

function parseIso(iso: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  if (!match) {
    throw new CalendarImportError(`"${iso}" is not a YYYY-MM-DD date.`);
  }
  return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
}

function toIso(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** One entry per day of each month. */
export function expandMonths(months: HijriMonthDefinition[]): CalendarEntry[] {
  const entries: CalendarEntry[] = [];

  for (const month of months) {
    if (month.length < 28 || month.length > 30) {
      throw new CalendarImportError(
        `${month.month} ${month.hijriYear}: a Hijri month is 29 or 30 days, got ${month.length}.`,
      );
    }

    const start = parseIso(month.startGregorian);
    for (let day = 1; day <= month.length; day++) {
      entries.push({
        hijriYear: month.hijriYear,
        month: month.month,
        day,
        gregorian: toIso(new Date(start.getTime() + (day - 1) * MS_PER_DAY)),
      });
    }
  }

  return entries;
}

/**
 * Consecutive months must join without a gap or an overlap - if they do not,
 * a length is wrong and every date after it would be shifted.
 */
export function checkMonthsAreContiguous(months: HijriMonthDefinition[]): string[] {
  const problems: string[] = [];
  const sorted = [...months].sort(
    (a, b) => parseIso(a.startGregorian).getTime() - parseIso(b.startGregorian).getTime(),
  );

  for (let i = 0; i + 1 < sorted.length; i++) {
    const current = sorted[i]!;
    const next = sorted[i + 1]!;
    const expected = new Date(
      parseIso(current.startGregorian).getTime() + current.length * MS_PER_DAY,
    );
    if (toIso(expected) !== next.startGregorian) {
      problems.push(
        `${current.month} ${current.hijriYear} is ${current.length} days, which puts the ` +
          `next month on ${toIso(expected)}, but ${next.month} ${next.hijriYear} ` +
          `starts ${next.startGregorian}.`,
      );
    }
  }

  return problems;
}

export interface CalendarImportResult {
  months: number;
  days: number;
  problems: string[];
}

export async function importCalendarMonths(
  months: HijriMonthDefinition[],
  options: { replaceYear?: number } = {},
): Promise<CalendarImportResult> {
  const problems = checkMonthsAreContiguous(months);
  const entries = expandMonths(months);

  if (options.replaceYear !== undefined) {
    await CalendarEntryModel.deleteMany({ hijriYear: options.replaceYear });
  }

  if (entries.length > 0) {
    await CalendarEntryModel.bulkWrite(
      entries.map((entry) => ({
        updateOne: {
          filter: { hijriYear: entry.hijriYear, month: entry.month, day: entry.day },
          update: { $set: entry },
          upsert: true,
        },
      })),
    );
  }

  return { months: months.length, days: entries.length, problems };
}

export async function getCalendar(hijriYear: number): Promise<CalendarEntry[]> {
  const docs = await CalendarEntryModel.find({ hijriYear }).lean();
  return docs.map((doc) => ({
    hijriYear: doc.hijriYear,
    month: doc.month as HijriMonth,
    day: doc.day,
    gregorian: doc.gregorian,
  }));
}

// ------------------------------------------------------------------- 1448

/**
 * Hijri 1448, read from the Alhabib global calendar for 2027 CE and
 * cross-checked against the printed grid (Zilqad ends 6 May, Zilhaj ends
 * 5 June, 1 Muharram 1449 is 6 June).
 *
 * This is the Hajj 1448 season: 9 Zilhaj (Arafat) falls on 15 May 2027.
 */
export const CALENDAR_1448: HijriMonthDefinition[] = [
  { hijriYear: 1448, month: "Ramadan", startGregorian: "2027-02-08", length: 30 },
  { hijriYear: 1448, month: "Shawwal", startGregorian: "2027-03-10", length: 29 },
  { hijriYear: 1448, month: "Zilqad", startGregorian: "2027-04-08", length: 29 },
  { hijriYear: 1448, month: "Zilhaj", startGregorian: "2027-05-07", length: 30 },
];
