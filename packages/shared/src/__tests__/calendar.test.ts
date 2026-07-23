import { describe, expect, it } from "vitest";

import {
  blockLabel,
  daysBetween,
  estimateNights,
  formatGregorianRange,
  indexCalendar,
  resolveBlock,
  resolveBlocks,
} from "../calendar";
import { blocks, calendar } from "./fixtures";

const byId = (id: string) => blocks.find((b) => b.id === id)!;

describe("night estimates (no calendar imported)", () => {
  it("counts nights inside one month", () => {
    expect(estimateNights({ month: "Zilhaj", day: 7 }, { month: "Zilhaj", day: 12 })).toBe(5);
    expect(estimateNights({ month: "Zilhaj", day: 8 }, { month: "Zilhaj", day: 12 })).toBe(4);
  });

  it("counts nights across a month boundary", () => {
    // 25 Zilqad -> 01 Zilhaj, assuming 30-day months
    expect(estimateNights({ month: "Zilqad", day: 25 }, { month: "Zilhaj", day: 1 })).toBe(6);
  });

  it("counts nights across the year boundary", () => {
    expect(estimateNights({ month: "Zilhaj", day: 28 }, { month: "Muharram", day: 3 })).toBe(5);
  });
});

describe("resolving against the imported calendar", () => {
  const index = indexCalendar(calendar);

  it("prefers real Gregorian dates over the estimate", () => {
    // Zilqad is 29 days in this fixture, so the estimate of 6 is wrong.
    const resolved = resolveBlock(byId("blk-pre-makkah"), index);
    expect(resolved.nights).toBe(5);
    expect(resolved.exact).toBe(true);
  });

  it("keeps the Hajj night counts the client expects", () => {
    expect(resolveBlock(byId("blk-hajj-5n"), index).nights).toBe(5);
    expect(resolveBlock(byId("blk-hajj-4n"), index).nights).toBe(4);
  });

  it("exposes both calendars for display", () => {
    const resolved = resolveBlock(byId("blk-hajj-5n"), index);
    expect(resolved.label).toBe("07 Zilhaj - 12 Zilhaj");
    expect(resolved.gregorianLabel).toBe("22 May - 27 May 2026");
  });

  it("falls back to the estimate when a date is missing", () => {
    const resolved = resolveBlock(byId("blk-post-aziziya"), indexCalendar([]));
    expect(resolved.exact).toBe(false);
    expect(resolved.nights).toBe(5);
    expect(resolved.gregorianLabel).toBeNull();
  });

  it("returns blocks in chronological order", () => {
    const resolved = resolveBlocks(blocks, calendar);
    const starts = resolved.map((b) => b.label);
    expect(starts[0]).toBe("20 Zilqad - 25 Zilqad");
    expect(starts.at(-1)).toBe("17 Zilhaj - 20 Zilhaj");
  });
});

describe("formatting helpers", () => {
  it("labels a block", () => {
    expect(blockLabel(byId("blk-aziziya-2"))).toBe("04 Zilhaj - 07 Zilhaj");
  });

  it("counts days between ISO dates", () => {
    expect(daysBetween("2026-05-22", "2026-05-27")).toBe(5);
    expect(daysBetween("2026-05-31", "2026-06-01")).toBe(1); // month rollover
    expect(daysBetween("nonsense", "2026-06-01")).toBeNull();
  });

  it("omits the repeated year within one year", () => {
    expect(formatGregorianRange("2026-05-22", "2026-05-27")).toBe("22 May - 27 May 2026");
    expect(formatGregorianRange("2026-12-30", "2027-01-02")).toBe(
      "30 December 2026 - 02 January 2027",
    );
  });
});
