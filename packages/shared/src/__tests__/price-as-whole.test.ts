import { describe, expect, it } from "vitest";

import { passengerSheetRows } from "../passengers";
import { bookingTotal, calculateTotals, perPersonShare } from "../pricing";

// Only what calculateTotals reads: the party's room cost for the stay, and its nights.
const stay = (groupTotal: number, nights = 5) => ({ groupTotal, nights }) as never;

describe("pricing a quotation as a whole booking", () => {
  const party = { stays: [stay(1_000_000)], flightTotal: 250_000, pax: 4 };

  it("never divides the party's total by pax", () => {
    // Per person: (1,000,000 + 4 x 250,000) / 4 = 500,000.
    expect(calculateTotals(party).finalTotal).toBe(500_000);
    // Whole: 1,000,000 + 4 x 250,000 = 2,000,000.
    expect(calculateTotals({ ...party, asWhole: true }).finalTotal).toBe(2_000_000);
  });

  it("takes the discount and round-off off the whole amount", () => {
    const totals = calculateTotals({ ...party, asWhole: true, discount: 30_000, roundOff: -20_000 });
    expect(totals).toMatchObject({ subtotal: 2_000_000, discount: 30_000, roundOff: -20_000, finalTotal: 1_950_000 });
  });

  it("lets a typed price replace the whole amount", () => {
    expect(calculateTotals({ ...party, asWhole: true, manualTotal: 1_900_000 })).toMatchObject({
      finalTotal: 1_900_000,
      manualOverride: true,
    });
  });

  it("leaves a per-person quotation exactly as before", () => {
    expect(calculateTotals({ ...party, asWhole: false })).toEqual(calculateTotals(party));
  });
});

describe("bookingTotal and perPersonShare", () => {
  it("multiply a per-person price, and share out a whole one", () => {
    const perPerson = { finalTotal: 500_000, guest: { pax: 4 } };
    const whole = { finalTotal: 2_000_000, priceAsWhole: true, guest: { pax: 4 } };
    expect(bookingTotal(perPerson)).toBe(2_000_000);
    expect(perPersonShare(perPerson)).toBe(500_000);
    expect(bookingTotal(whole)).toBe(2_000_000);
    expect(perPersonShare(whole)).toBe(500_000);
  });

  it("puts each passenger's share on the passenger sheet", () => {
    const rows = passengerSheetRows({
      date: "2026-11-20",
      guest: { name: "Family", pax: 4 },
      finalTotal: 2_000_000,
      priceAsWhole: true,
      stays: [],
    });
    expect(rows.map((row) => row.packageAmount)).toEqual([500_000, 500_000, 500_000, 500_000]);
  });
});
