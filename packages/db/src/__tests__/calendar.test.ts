import { estimateNights, resolveBlocks } from "@junaidi/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { DEFAULT_SEASON, seed } from "../seed";
import {
  CALENDAR_1448,
  CalendarImportError,
  checkMonthsAreContiguous,
  expandMonths,
  getCalendar,
  importCalendarMonths,
} from "../services/calendar";
import { getConfigBundle } from "../services/config";
import { connectTestDb, dropTestDb } from "./setup";

beforeAll(async () => {
  await connectTestDb("calendar");
  await seed();
}, 60_000);

afterAll(async () => {
  await dropTestDb();
});

describe("expanding published months into days", () => {
  it("produces one row per day", () => {
    const entries = expandMonths([
      { hijriYear: 1448, month: "Zilqad", startGregorian: "2027-04-08", length: 29 },
    ]);
    expect(entries).toHaveLength(29);
    expect(entries[0]).toEqual({
      hijriYear: 1448, month: "Zilqad", day: 1, gregorian: "2027-04-08",
    });
    expect(entries.at(-1)).toEqual({
      hijriYear: 1448, month: "Zilqad", day: 29, gregorian: "2027-05-06",
    });
  });

  it("crosses Gregorian month boundaries correctly", () => {
    const entries = expandMonths([
      { hijriYear: 1448, month: "Zilhaj", startGregorian: "2027-05-07", length: 30 },
    ]);
    // 1 Zilhaj = 7 May, so 30 Zilhaj = 5 June and 1 Muharram 1449 = 6 June.
    expect(entries.at(-1)!.gregorian).toBe("2027-06-05");
  });

  it("rejects an impossible month length", () => {
    expect(() =>
      expandMonths([
        { hijriYear: 1448, month: "Zilhaj", startGregorian: "2027-05-07", length: 31 },
      ]),
    ).toThrow(CalendarImportError);
  });
});

describe("guarding against a mistyped import", () => {
  it("accepts the published 1448 months", () => {
    expect(checkMonthsAreContiguous(CALENDAR_1448)).toEqual([]);
  });

  it("catches a wrong month length, which would shift every later date", () => {
    const broken = CALENDAR_1448.map((month) =>
      month.month === "Zilqad" ? { ...month, length: 30 } : month,
    );
    const problems = checkMonthsAreContiguous(broken);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("Zilqad");
  });
});

describe("the seeded 1448 calendar", () => {
  it("stores every day of the Hajj months", async () => {
    const calendar = await getCalendar(1448);
    expect(calendar.length).toBe(30 + 29 + 29 + 30); // Ramadan..Zilhaj

    const find = (month: string, day: number) =>
      calendar.find((entry) => entry.month === month && entry.day === day)?.gregorian;

    expect(find("Zilqad", 1)).toBe("2027-04-08");
    expect(find("Zilhaj", 1)).toBe("2027-05-07");
    expect(find("Zilhaj", 9)).toBe("2027-05-15"); // Arafat
    expect(find("Zilhaj", 10)).toBe("2027-05-16"); // Eid al-Adha
  });

  it("is safe to re-import", async () => {
    const before = (await getCalendar(1448)).length;
    await importCalendarMonths(CALENDAR_1448);
    expect((await getCalendar(1448)).length).toBe(before);
  });
});

/**
 * The reason the calendar exists. Zilqad 1448 is 29 days, so a flat 30-day
 * assumption overstates this block by a night - and a night is money.
 */
describe("real dates beat the estimate", () => {
  it("counts 25 Zilqad to 01 Zilhaj as 5 nights, not the 6 an estimate gives", async () => {
    const bundle = await getConfigBundle(DEFAULT_SEASON);
    const blocks = resolveBlocks(bundle.blocks, bundle.calendar);

    const block = blocks.find((b) => b.label === "25 Zilqad - 01 Zilhaj")!;

    expect(estimateNights(block.startHijri, block.endHijri)).toBe(6); // what we would have assumed
    expect(block.nights).toBe(5); // what the published calendar says
    expect(block.exact).toBe(true);
  });

  it("marks every block as exact and shows both calendars", async () => {
    const bundle = await getConfigBundle(DEFAULT_SEASON);
    const blocks = resolveBlocks(bundle.blocks, bundle.calendar);

    expect(blocks.every((block) => block.exact)).toBe(true);
    expect(blocks.every((block) => block.gregorianLabel !== null)).toBe(true);
  });

  it("keeps the Hajj blocks at 5 and 4 nights", async () => {
    const bundle = await getConfigBundle(DEFAULT_SEASON);
    const blocks = resolveBlocks(bundle.blocks, bundle.calendar);

    const viaAziziya = blocks.find((b) => b.label === "07 Zilhaj - 12 Zilhaj")!;
    const viaMakkah = blocks.find((b) => b.label === "08 Zilhaj - 12 Zilhaj")!;

    expect(viaAziziya.nights).toBe(5);
    expect(viaMakkah.nights).toBe(4);
    expect(viaAziziya.gregorianLabel).toBe("13 May - 18 May 2027");
  });

  it("no longer reports a missing calendar to the admin", async () => {
    const bundle = await getConfigBundle(DEFAULT_SEASON);
    const { findConfigProblems } = await import("../services/config");
    expect(findConfigProblems(bundle).map((p) => p.kind)).not.toContain("NO_CALENDAR");
  });
});
