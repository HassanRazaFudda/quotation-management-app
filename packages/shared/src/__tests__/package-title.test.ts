import { describe, expect, it } from "vitest";

import { buildPackageTitle, daysForNights } from "../package-title";

/**
 * The title assembles itself as the staff member works, so nobody retypes
 * "Hajj 2027/1448 Maktab A Category - 28 Days Package (Customize)".
 */
describe("buildPackageTitle", () => {
  it("starts with just the season", () => {
    expect(buildPackageTitle({ season: "1448", gregorianYear: 2027 })).toBe("Hajj 2027/1448");
  });

  it("appends the category once it is chosen", () => {
    expect(
      buildPackageTitle({ season: "1448", gregorianYear: 2027, category: "Maktab A Category" }),
    ).toBe("Hajj 2027/1448 Maktab A Category");
  });

  it("waits for the itinerary before naming the days", () => {
    const parts = {
      season: "1448", gregorianYear: 2027, category: "Maktab A Category", totalNights: 27,
    };
    expect(buildPackageTitle(parts)).toBe("Hajj 2027/1448 Maktab A Category");
    expect(buildPackageTitle({ ...parts, itineraryComplete: true })).toBe(
      "Hajj 2027/1448 Maktab A Category - 28 Days Package (Customize)",
    );
  });

  it("quotes days as nights plus the arrival day", () => {
    expect(daysForNights(27)).toBe(28);
    expect(daysForNights(0)).toBe(0);
  });

  it("falls back to the Hijri year alone when the calendar is missing", () => {
    expect(buildPackageTitle({ season: "1448" })).toBe("Hajj 1448");
  });

  it("omits the day count when the itinerary is empty", () => {
    expect(
      buildPackageTitle({ season: "1448", gregorianYear: 2027, totalNights: 0, itineraryComplete: true }),
    ).toBe("Hajj 2027/1448");
  });
});
