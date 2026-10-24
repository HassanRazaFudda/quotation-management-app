import { describe, expect, it } from "vitest";

import {
  nightsBetween,
  parseIsoDate,
  priceUmrahQuotation,
  umrahPartyLine,
  type UmrahPricingInput,
  type UmrahStayInput,
} from "../umrah";

const PKR = { code: "PKR", symbol: "PKR", decimals: 0 };
const SAR_RATE = { code: "SAR", rate: 75 };

function stay(overrides: Partial<UmrahStayInput> = {}): UmrahStayInput {
  return {
    city: "Makkah",
    hotelName: "Test Hotel",
    distance: "",
    checkIn: "2026-12-10",
    checkOut: "2026-12-11",
    meal: "",
    currencyCode: "PKR",
    rateBasis: "room",
    rooms: [{ roomType: "Quad", rooms: 1, persons: 4, rate: 10_000 }],
    tierRates: { Quad: null, Triple: null, Double: null },
    withoutBedRate: 0,
    ...overrides,
  };
}

function quote(overrides: Partial<UmrahPricingInput> = {}): UmrahPricingInput {
  return {
    mode: "single",
    priceDisplay: "average",
    transportDisplay: "included",
    guest: { pax: 4, withoutBedPax: 0, infants: 0 },
    currency: PKR,
    exchangeRates: [SAR_RATE],
    stays: [stay()],
    transportLegs: [],
    flight: { included: false, airline: "", outbound: "", inbound: "", adultFare: 0, infantFare: 0, currencyCode: "PKR" },
    charges: [],
    lineSettings: [],
    ...overrides,
  };
}

const main = (result: ReturnType<typeof priceUmrahQuotation>) => result.lines.find((l) => l.key === "main")!;
const errors = (result: ReturnType<typeof priceUmrahQuotation>) =>
  result.issues.filter((i) => i.severity === "error").map((i) => i.message);

describe("dates", () => {
  it("counts nights between two dates", () => {
    expect(nightsBetween("2026-12-10", "2026-12-12")).toBe(2);
    expect(nightsBetween("2026-12-28", "2027-01-02")).toBe(5);
  });

  it("is 0 for a reversed, equal or invalid range", () => {
    expect(nightsBetween("2026-12-12", "2026-12-10")).toBe(0);
    expect(nightsBetween("2026-12-10", "2026-12-10")).toBe(0);
    expect(nightsBetween("2026-02-30", "2026-03-05")).toBe(0);
    expect(nightsBetween("", "2026-03-05")).toBe(0);
  });

  it("rejects dates that roll over", () => {
    expect(parseIsoDate("2026-02-30")).toBeNull();
    expect(parseIsoDate("2026-13-01")).toBeNull();
    expect(parseIsoDate("2026-02-28")).not.toBeNull();
  });
});

describe("single mode", () => {
  it("prices per-room rates typed in SAR into PKR", () => {
    const result = priceUmrahQuotation(
      quote({
        stays: [
          stay({ city: "Madinah", checkIn: "2026-12-10", checkOut: "2026-12-12", currencyCode: "SAR", rooms: [{ roomType: "Quad", rooms: 1, persons: 4, rate: 200 }] }),
          stay({ city: "Makkah", checkIn: "2026-12-12", checkOut: "2026-12-19", currencyCode: "SAR", rooms: [{ roomType: "Quad", rooms: 1, persons: 4, rate: 300 }] }),
        ],
      }),
    );
    // 200 x 2 nights + 300 x 7 nights = 2,500 SAR = 187,500 PKR.
    expect(result.hasErrors).toBe(false);
    expect(result.totalNights).toBe(9);
    expect(main(result).groupTotal).toBe(187_500);
    expect(main(result).finalTotal).toBe(46_875);
    expect(result.grandTotal).toBe(187_500);
  });

  it("prices a per-person rate by guests, not rooms", () => {
    const result = priceUmrahQuotation(
      quote({
        stays: [
          stay({
            checkOut: "2026-12-13",
            currencyCode: "SAR",
            rateBasis: "person",
            rooms: [{ roomType: "Quad", rooms: 1, persons: 4, rate: 100 }],
          }),
        ],
      }),
    );
    // 100 SAR x 4 people x 3 nights = 1,200 SAR = 90,000 PKR.
    expect(main(result).groupTotal).toBe(90_000);
    expect(main(result).finalTotal).toBe(22_500);
  });

  it("shows prices in a foreign currency", () => {
    const result = priceUmrahQuotation(
      quote({
        currency: { code: "SAR", symbol: "SAR", decimals: 2 },
        guest: { pax: 1, withoutBedPax: 0, infants: 0 },
        stays: [stay({ rooms: [{ roomType: "Single", rooms: 1, persons: 1, rate: 7_500 }] })],
      }),
    );
    expect(main(result).finalTotal).toBe(100);
  });

  it("needs exactly one room line", () => {
    const result = priceUmrahQuotation(
      quote({
        stays: [
          stay({
            rooms: [
              { roomType: "Quad", rooms: 1, persons: 2, rate: 10_000 },
              { roomType: "Double", rooms: 1, persons: 2, rate: 8_000 },
            ],
          }),
        ],
      }),
    );
    expect(errors(result).some((m) => m.includes("exactly one room line"))).toBe(true);
  });

  it("blocks a room line that does not seat the with-bed guests", () => {
    const result = priceUmrahQuotation(
      quote({ stays: [stay({ rooms: [{ roomType: "Quad", rooms: 1, persons: 3, rate: 10_000 }] })] }),
    );
    expect(result.hasErrors).toBe(true);
    expect(errors(result)[0]).toContain("hold 3 guests but the quote has 4");
  });
});

describe("family mode", () => {
  it("weights a mix of rooms across the party", () => {
    const result = priceUmrahQuotation(
      quote({
        mode: "family",
        guest: { pax: 6, withoutBedPax: 0, infants: 0 },
        stays: [
          stay({
            checkOut: "2026-12-12",
            rooms: [
              { roomType: "Quad", rooms: 1, persons: 4, rate: 40_000 },
              { roomType: "Double", rooms: 1, persons: 2, rate: 25_000 },
            ],
          }),
        ],
      }),
    );
    // (40,000 + 25,000) x 2 nights = 130,000 over 6 people.
    expect(main(result).groupTotal).toBe(130_000);
    expect(main(result).finalTotal).toBe(21_667);
  });

  it("blocks a mix that seats the wrong number of guests", () => {
    const result = priceUmrahQuotation(
      quote({
        mode: "family",
        guest: { pax: 6, withoutBedPax: 0, infants: 0 },
        stays: [
          stay({
            rooms: [
              { roomType: "Quad", rooms: 1, persons: 4, rate: 40_000 },
              { roomType: "Double", rooms: 1, persons: 1, rate: 25_000 },
            ],
          }),
        ],
      }),
    );
    expect(errors(result)[0]).toContain("hold 5 guests but the quote has 6");
  });
});

describe("room types mode", () => {
  const tiered = (overrides: Partial<UmrahPricingInput> = {}) =>
    quote({
      mode: "tiered",
      stays: [
        stay({
          checkOut: "2026-12-12",
          currencyCode: "SAR",
          rooms: [],
          tierRates: { Quad: 400, Triple: 360, Double: 300 },
        }),
      ],
      ...overrides,
    });

  it("prices each room type for the same itinerary", () => {
    const result = priceUmrahQuotation(tiered());
    const price = (key: string) => result.lines.find((l) => l.key === key)!.finalTotal;
    // Per person per night: 400/4 = 100, 360/3 = 120, 300/2 = 150 SAR; x 2 nights x 75.
    expect(result.hasErrors).toBe(false);
    expect(price("Quad")).toBe(15_000);
    expect(price("Triple")).toBe(18_000);
    expect(price("Double")).toBe(22_500);
    expect(result.grandTotal).toBe(0);
  });

  it("refuses a short price when a hotel lacks a room type", () => {
    const result = priceUmrahQuotation(
      tiered({
        stays: [stay({ checkOut: "2026-12-12", currencyCode: "SAR", rooms: [], tierRates: { Quad: 400, Triple: 360, Double: null } })],
      }),
    );
    expect(result.hasErrors).toBe(true);
    expect(result.tierIncomplete.Double).toBe(true);
    expect(result.issues.find((i) => i.path === "tiers.Double")).toBeDefined();
  });

  it("accepts a typed price for the incomplete tier, or dropping it", () => {
    const stays = [stay({ checkOut: "2026-12-12", currencyCode: "SAR", rooms: [], tierRates: { Quad: 400, Triple: 360, Double: null } })];
    const typed = priceUmrahQuotation(
      tiered({ stays, lineSettings: [{ key: "Double", discount: 0, roundOff: 0, manualTotal: 25_000 }] }),
    );
    expect(typed.hasErrors).toBe(false);
    expect(typed.lines.find((l) => l.key === "Double")).toMatchObject({ finalTotal: 25_000, manualOverride: true });

    const dropped = priceUmrahQuotation(
      tiered({ stays, lineSettings: [{ key: "Double", offered: false, discount: 0, roundOff: 0, manualTotal: null }] }),
    );
    expect(dropped.hasErrors).toBe(false);
    expect(dropped.lines.map((l) => l.key)).toEqual(["Quad", "Triple"]);
  });

  it("needs at least one tier offered", () => {
    const off = (key: string) => ({ key, offered: false, discount: 0, roundOff: 0, manualTotal: null });
    const result = priceUmrahQuotation(tiered({ lineSettings: [off("Quad"), off("Triple"), off("Double")] }));
    expect(errors(result)).toContain("Offer at least one room type.");
  });
});

describe("without-bed guests and infants", () => {
  const party = { pax: 2, withoutBedPax: 1, infants: 0 };
  const stays = [
    stay({
      rooms: [{ roomType: "Double", rooms: 1, persons: 2, rate: 20_000 }],
      withoutBedRate: 5_000,
    }),
  ];

  it("averages with-bed and without-bed guests into one price", () => {
    const result = priceUmrahQuotation(quote({ guest: party, stays }));
    expect(main(result).count).toBe(3);
    expect(main(result).finalTotal).toBe(8_333); // 25,000 / 3
  });

  it("breaks them out when asked", () => {
    const result = priceUmrahQuotation(quote({ guest: party, stays, priceDisplay: "breakdown" }));
    expect(main(result)).toMatchObject({ label: "Per Person (With Bed)", count: 2, finalTotal: 10_000 });
    expect(result.lines.find((l) => l.key === "withoutBed")).toMatchObject({ count: 1, finalTotal: 5_000 });
    expect(result.grandTotal).toBe(25_000);
  });

  it("prices an infant on its own fares and not on the room or the van", () => {
    const result = priceUmrahQuotation(
      quote({
        guest: { pax: 2, withoutBedPax: 0, infants: 1 },
        stays: [stay({ rooms: [{ roomType: "Double", rooms: 1, persons: 2, rate: 10_000 }] })],
        flight: { included: true, airline: "EK", outbound: "KHI-MED", inbound: "", adultFare: 100_000, infantFare: 30_000, currencyCode: "PKR" },
        transportLegs: [{ route: "Madinah to Makkah", vehicle: "Staria", cost: 20_000, currencyCode: "PKR" }],
        charges: [{ label: "Infant visa", amount: 5_000, currencyCode: "PKR", basis: "perInfant" }],
      }),
    );
    // Adults: 10,000 room + 2 x 100,000 fare + 20,000 van = 230,000 over 2.
    expect(main(result).finalTotal).toBe(115_000);
    // Infant: 30,000 fare + 5,000 visa; no room, no van.
    expect(result.lines.find((l) => l.key === "infant")).toMatchObject({ count: 1, finalTotal: 35_000 });
    expect(result.grandTotal).toBe(115_000 * 2 + 35_000);
  });

  it("warns, rather than fails, when without-bed guests have no rate", () => {
    const result = priceUmrahQuotation(quote({ guest: party, stays: [stay({ rooms: [{ roomType: "Double", rooms: 1, persons: 2, rate: 20_000 }] })] }));
    expect(result.hasErrors).toBe(false);
    expect(result.issues.some((i) => i.severity === "warning" && i.path.endsWith("withoutBedRate"))).toBe(true);
  });
});

describe("transport and other charges", () => {
  const legs = [{ route: "Makkah to Madinah", vehicle: "Staria", cost: 117_000, currencyCode: "PKR" }];

  it("folds transport into the per-person price", () => {
    const result = priceUmrahQuotation(quote({ transportLegs: legs, stays: [stay({ rooms: [{ roomType: "Quad", rooms: 1, persons: 4, rate: 40_000 }] })] }));
    expect(result.transportTotal).toBe(117_000);
    expect(main(result).finalTotal).toBe(39_250); // (40,000 + 117,000) / 4
    expect(result.grandTotal).toBe(157_000);
  });

  it("shows transport as its own line, outside the per-person price", () => {
    const result = priceUmrahQuotation(
      quote({ transportDisplay: "separate", transportLegs: legs, stays: [stay({ rooms: [{ roomType: "Quad", rooms: 1, persons: 4, rate: 40_000 }] })] }),
    );
    expect(main(result).finalTotal).toBe(10_000);
    expect(result.grandTotal).toBe(157_000); // 40,000 + 117,000 transport
  });

  it("adds per-person and per-group charges", () => {
    const result = priceUmrahQuotation(
      quote({
        guest: { pax: 2, withoutBedPax: 0, infants: 0 },
        stays: [stay({ rooms: [{ roomType: "Double", rooms: 1, persons: 2, rate: 20_000 }] })],
        charges: [
          { label: "Umrah visa", amount: 25_000, currencyCode: "PKR", basis: "perPerson" },
          { label: "Handling", amount: 8_000, currencyCode: "PKR", basis: "perGroup" },
        ],
      }),
    );
    // 20,000 room + 2 x 25,000 visa + 8,000 fee = 78,000 over 2.
    expect(main(result).finalTotal).toBe(39_000);
  });
});

describe("discount, round-off and manual price", () => {
  const one = (settings: { discount?: number; roundOff?: number; manualTotal?: number | null }) =>
    priceUmrahQuotation(
      quote({
        guest: { pax: 1, withoutBedPax: 0, infants: 0 },
        stays: [stay({ rooms: [{ roomType: "Single", rooms: 1, persons: 1, rate: 10_001 }] })],
        lineSettings: [{ key: "main", discount: 0, roundOff: 0, manualTotal: null, ...settings }],
      }),
    );

  it("takes the discount off, then rounds", () => {
    const line = main(one({ discount: 500, roundOff: 499 }));
    expect(line).toMatchObject({ subtotal: 10_001, discount: 500, roundOff: 499, finalTotal: 10_000 });
  });

  it("lets a typed price replace the calculation", () => {
    expect(main(one({ manualTotal: 9_000 }))).toMatchObject({ finalTotal: 9_000, manualOverride: true });
  });

  it("never discounts below free", () => {
    expect(main(one({ discount: 99_999 })).finalTotal).toBe(0);
  });
});

describe("validation", () => {
  it("needs a hotel stay", () => {
    expect(errors(priceUmrahQuotation(quote({ stays: [] })))).toContain("Add at least one hotel stay.");
  });

  it("needs check-out after check-in", () => {
    const result = priceUmrahQuotation(quote({ stays: [stay({ checkIn: "2026-12-12", checkOut: "2026-12-10" })] }));
    expect(errors(result).some((m) => m.includes("check-out must be after check-in"))).toBe(true);
  });

  it("caps a stay's length", () => {
    const result = priceUmrahQuotation(quote({ stays: [stay({ checkIn: "2026-01-01", checkOut: "2027-01-01" })] }));
    expect(errors(result).some((m) => m.includes("cannot exceed"))).toBe(true);
  });

  it("never falls back to PKR when a currency has no rate", () => {
    const result = priceUmrahQuotation(quote({ exchangeRates: [], stays: [stay({ currencyCode: "SAR" })] }));
    expect(errors(result)).toContain("Set an exchange rate for SAR.");
    // 10,000 SAR must not be quietly priced as 10,000 PKR.
    expect(main(result).finalTotal).not.toBe(2_500);
  });

  it("needs a rate for the display currency too", () => {
    const result = priceUmrahQuotation(quote({ currency: { code: "USD", symbol: "USD", decimals: 2 } }));
    expect(errors(result)).toContain("Set an exchange rate for USD.");
  });

  it("needs a guest with a bed", () => {
    const result = priceUmrahQuotation(quote({ guest: { pax: 0, withoutBedPax: 0, infants: 0 } }));
    expect(errors(result)).toContain("At least one guest with a bed is needed.");
  });

  it("warns about overlapping stays", () => {
    const result = priceUmrahQuotation(
      quote({
        stays: [
          stay({ checkIn: "2026-12-10", checkOut: "2026-12-14" }),
          stay({ checkIn: "2026-12-12", checkOut: "2026-12-16" }),
        ],
        guest: { pax: 4, withoutBedPax: 0, infants: 0 },
      }),
    );
    expect(result.issues.some((i) => i.severity === "warning" && i.message.includes("starts before"))).toBe(true);
  });
});

describe("umrahPartyLine", () => {
  it("lists only the groups that are present", () => {
    expect(umrahPartyLine("Ali", { pax: 4, withoutBedPax: 0, infants: 0 })).toBe("Ali * 04 PAX");
    expect(umrahPartyLine("Ali", { pax: 3, withoutBedPax: 1, infants: 1 })).toBe("Ali * 03 PAX + 01 WITHOUT BED + 01 INF");
  });
});
