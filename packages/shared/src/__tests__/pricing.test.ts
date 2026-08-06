import { describe, expect, it } from "vitest";

import { resolveBlocks } from "../calendar";
import {
  PricingError,
  calculateTotals,
  finalTierTotal,
  formatPrice,
  makePricingContext,
  priceStay,
  priceStays,
  priceTiers,
  roundOffSuggestions,
  toPdfTotals,
} from "../pricing";
import { OCCUPANCIES, emptyRate, type StayInput, type TierOccupancy } from "../types";
import { SEASON, accommodations, blocks, calendar, locations, rates } from "./fixtures";

const resolved = resolveBlocks(blocks, calendar);
const context = makePricingContext({
  blocks: resolved,
  accommodations,
  locations,
  rates,
});

/** A stay's room travels with the stay, not with the quotation. */
const sharing = { roomType: "sharing", occupancy: "Sharing" } as const;

/**
 * The central rule: a Hajj hotel is booked for a whole block at a negotiated
 * figure. Nothing is ever multiplied by the night count.
 */
describe("a rate is the total for its block", () => {
  it("charges the block figure, not nights x anything", () => {
    const stay: StayInput = {
      blockId: "blk-pre-madinah", // 5 nights
      locationId: "loc-madinah",
      accommodationId: "acc-sofitel",
      ...sharing,
    };
    const priced = priceStay(stay, context);

    expect(priced.nights).toBe(5); // carried for display
    expect(priced.lineTotal).toBe(110_000); // the block rate, untouched
  });

  it("prices the same hotel differently in a different block", () => {
    const pre = priceStay(
      { blockId: "blk-pre-madinah", locationId: "loc-madinah", accommodationId: "acc-sofitel", ...sharing },
      context,
    );
    const post = priceStay(
      { blockId: "blk-post-madinah", locationId: "loc-madinah", accommodationId: "acc-sofitel", ...sharing },
      context,
    );

    expect(pre.lineTotal).toBe(110_000);
    expect(post.lineTotal).toBe(62_000);
  });

  it("does not assume a block rate scales with nights", () => {
    const long = priceStay(
      { blockId: "blk-pre-makkah", locationId: "loc-makkah", accommodationId: "acc-swiss", ...sharing },
      context,
    );
    const short = priceStay(
      { blockId: "blk-makkah-8", locationId: "loc-makkah", accommodationId: "acc-swiss", ...sharing },
      context,
    );

    expect(long.lineTotal / long.nights).not.toBeCloseTo(short.lineTotal / short.nights);
  });
});

/**
 * Room choice is per stay: a guest can share in Makkah and take a private room
 * in Aziziya, so two rows of the same quotation can differ.
 */
describe("byOccupancy - Makkah / Madinah", () => {
  const base = {
    blockId: "blk-pre-madinah",
    locationId: "loc-madinah",
    accommodationId: "acc-sofitel",
  };

  it("uses the Sharing rate for a shared room", () => {
    expect(priceStay({ ...base, ...sharing }, context).lineTotal).toBe(110_000);
  });

  it("varies by the stay's own room size", () => {
    expect(
      priceStay({ ...base, roomType: "sharing", occupancy: "Triple" }, context).lineTotal,
    ).toBe(130_000);
    expect(
      priceStay({ ...base, roomType: "sharing", occupancy: "Double" }, context).lineTotal,
    ).toBe(160_000);
  });

  it("prices every shared-room wording identically", () => {
    // Quad / Quint / Hexa are offered when the group fills whole rooms of that
    // size. They change the word on the quotation, never the figure.
    for (const sharingWord of ["Quad", "Quint", "Hexa"] as const) {
      expect(
        priceStay({ ...base, ...sharing, sharingWord }, context).lineTotal,
      ).toBe(110_000);
    }
  });

  /**
   * A hotel offering a size beyond the original three is priced the same way -
   * a plain lookup - as long as the admin has actually set that size's rate.
   */
  it("prices a hotel-specific size once its rate is set", () => {
    const withQuint = makePricingContext({
      blocks: resolved,
      accommodations,
      locations,
      rates: rates.map((r) =>
        r.model === "byOccupancy" && r.accommodationId === "acc-sofitel" && r.blockId === "blk-pre-madinah"
          ? { ...r, rates: { ...r.rates, Quint: 145_000 } }
          : r,
      ),
    });
    expect(
      priceStay({ ...base, roomType: "sharing", occupancy: "Quint" }, withQuint).lineTotal,
    ).toBe(145_000);
  });

  /**
   * A size added to a hotel after its rate row was last saved has no key at
   * all yet - that must fail loudly, not quietly price the stay at nothing.
   */
  it("refuses a size the rate has never been given a figure for", () => {
    expect(() =>
      priceStay({ ...base, roomType: "sharing", occupancy: "Quint" }, context),
    ).toThrow(/no rate is set for "quint"/i);
  });
});

describe("sharingOrSeparate - Aziziya", () => {
  const base = {
    blockId: "blk-aziziya-1",
    locationId: "loc-aziziya",
    accommodationId: "acc-aziziya",
  };

  it("charges one figure for sharing, with no room size", () => {
    expect(priceStay({ ...base, roomType: "sharing" }, context).lineTotal).toBe(24_000);
  });

  it("prices a separate room by its size", () => {
    expect(
      priceStay({ ...base, roomType: "separate", occupancy: "Triple" }, context).lineTotal,
    ).toBe(42_000);
    expect(
      priceStay({ ...base, roomType: "separate", occupancy: "Double" }, context).lineTotal,
    ).toBe(54_000);
  });

  it("varies by block", () => {
    expect(
      priceStay({ ...base, blockId: "blk-aziziya-2", roomType: "sharing" }, context).lineTotal,
    ).toBe(22_000);
  });

  it("refuses a missing room type", () => {
    expect(() => priceStay({ ...base }, context)).toThrow(PricingError);
  });

  it("refuses a separate room with no size", () => {
    expect(() => priceStay({ ...base, roomType: "separate" }, context)).toThrow(
      /Separate room needs a room size/,
    );
  });
});

describe("flat - Mina", () => {
  const base = {
    blockId: "blk-hajj-5n",
    locationId: "loc-mina",
    accommodationId: "acc-mina-std",
  };

  it("charges the tier's block figure and ignores any room choice", () => {
    const priced = priceStay(base, context);
    expect(priced.nights).toBe(5);
    expect(priced.lineTotal).toBe(145_000);
  });

  it("differs by tier and by block", () => {
    expect(priceStay({ ...base, accommodationId: "acc-mina-dlx" }, context).lineTotal).toBe(260_000);
    expect(priceStay({ ...base, blockId: "blk-hajj-4n" }, context).lineTotal).toBe(132_000);
  });
});

describe("a stay that spans the Hajj days", () => {
  // 04 -> 17 Zilhaj Aziziya (13 nights), with the 07 -> 12 Hajj row inside it.
  const spanning: StayInput[] = [
    { blockId: "blk-aziziya-hajj", locationId: "loc-aziziya", accommodationId: "acc-aziziya", ...sharing },
    { blockId: "blk-hajj-5n", locationId: "loc-mina", accommodationId: "acc-mina-std" },
  ];

  it("keeps the hotel's nights and drops the nested Hajj row's", () => {
    const [hotel, hajj] = priceStays(spanning, context);
    expect(hotel!.nights).toBe(13);
    expect(hajj!.nights).toBe(0); // its days are already counted by the hotel row
  });

  it("charges both rows in full - the Maktab is a real, separate charge", () => {
    const [hotel, hajj] = priceStays(spanning, context);
    expect(hotel!.lineTotal).toBe(95_000);
    expect(hajj!.lineTotal).toBe(145_000);
  });

  it("counts the spanned days once in the totals", () => {
    const totals = calculateTotals({ stays: priceStays(spanning, context) });
    expect(totals.totalNights).toBe(13); // not 13 + 5
    expect(totals.subtotal).toBe(95_000 + 145_000);
  });

  it("leaves an ordinary Hajj itinerary untouched", () => {
    // Aziziya 04 -> 07, then the Hajj block after it: nothing nests.
    const normal: StayInput[] = [
      { blockId: "blk-aziziya-2", locationId: "loc-aziziya", accommodationId: "acc-aziziya", ...sharing },
      { blockId: "blk-hajj-5n", locationId: "loc-mina", accommodationId: "acc-mina-std" },
    ];
    const [aziziya, hajj] = priceStays(normal, context);
    expect(aziziya!.nights).toBe(3);
    expect(hajj!.nights).toBe(5); // still counted - it follows, it is not nested
  });
});

describe("missing configuration", () => {
  it("names the hotel and the block when no rate is set", () => {
    expect(() =>
      priceStay(
        { blockId: "blk-aziziya-1", locationId: "loc-madinah", accommodationId: "acc-sofitel", ...sharing },
        context,
      ),
    ).toThrow(/Sofitel Madinah Hotel.*01 Zilhaj - 04 Zilhaj/);
  });
});

describe("totals", () => {
  const stays: StayInput[] = [
    { blockId: "blk-pre-madinah", locationId: "loc-madinah", accommodationId: "acc-sofitel", ...sharing },
    { blockId: "blk-aziziya-2", locationId: "loc-aziziya", accommodationId: "acc-aziziya", roomType: "sharing" },
    { blockId: "blk-hajj-5n", locationId: "loc-mina", accommodationId: "acc-mina-std" },
  ];
  const priced = priceStays(stays, context);
  const accommodationTotal = 110_000 + 22_000 + 145_000;

  it("sums the block totals and reports the nights", () => {
    const totals = calculateTotals({ stays: priced });
    expect(totals.totalNights).toBe(5 + 3 + 5);
    expect(totals.subtotal).toBe(accommodationTotal);
  });

  it("adds the air fare when flights are included", () => {
    const totals = calculateTotals({ stays: priced, flightTotal: 250_000 });
    expect(totals.subtotal).toBe(accommodationTotal + 250_000);
  });

  it("subtracts a fixed discount", () => {
    const totals = calculateTotals({ stays: priced, discount: 27_000 });
    expect(totals.discount).toBe(27_000);
    expect(totals.finalTotal).toBe(accommodationTotal - 27_000);
  });

  it("never lets a discount exceed the subtotal or go negative", () => {
    expect(calculateTotals({ stays: priced, discount: 999_999 }).finalTotal).toBe(0);
    expect(calculateTotals({ stays: priced, discount: -500 }).discount).toBe(0);
  });

  it("lets a manual total win", () => {
    const totals = calculateTotals({ stays: priced, discount: 27_000, manualTotal: 300_000 });
    expect(totals.manualOverride).toBe(true);
    expect(totals.finalTotal).toBe(300_000);
  });

  it("nudges the net up or down by a signed round-off", () => {
    const up = calculateTotals({ stays: priced, roundOff: 500 });
    expect(up.roundOff).toBe(500);
    expect(up.finalTotal).toBe(accommodationTotal + 500);

    const down = calculateTotals({ stays: priced, roundOff: -500 });
    expect(down.roundOff).toBe(-500);
    expect(down.finalTotal).toBe(accommodationTotal - 500);
  });

  it("rounds off the net after the discount, never below zero", () => {
    // Net is 277,000 - 27,000 = 250,000; +250 tidies it to 250,250.
    const totals = calculateTotals({ stays: priced, discount: 27_000, roundOff: 250 });
    expect(totals.finalTotal).toBe(accommodationTotal - 27_000 + 250);

    const clamped = calculateTotals({ stays: priced, roundOff: -999_999 });
    expect(clamped.finalTotal).toBe(0);
  });

  it("ignores the round-off when a manual total is set", () => {
    const totals = calculateTotals({ stays: priced, roundOff: 500, manualTotal: 300_000 });
    expect(totals.roundOff).toBe(0);
    expect(totals.finalTotal).toBe(300_000);
  });

  it("converts the subtotal to the currency, then discounts and rounds in it", () => {
    // 277,000 PKR at 1 USD = 200 PKR is 1,385.00; a USD discount and round-off
    // then apply in USD, to two decimals.
    const totals = calculateTotals({
      stays: priced,
      exchangeRate: 200,
      decimals: 2,
      discount: 85, // USD
      roundOff: 0.5, // USD
    });
    expect(totals.subtotal).toBe(1385);
    expect(totals.discount).toBe(85);
    expect(totals.finalTotal).toBe(1300.5);
  });

  it("keeps whole rupees when no currency is given (rate defaults to 1)", () => {
    const totals = calculateTotals({ stays: priced, discount: 27_000 });
    expect(totals.subtotal).toBe(accommodationTotal);
    expect(totals.finalTotal).toBe(accommodationTotal - 27_000);
  });
});

describe("roundOffSuggestions - the nearest tidy figures", () => {
  it("offers the step to the previous and next thousand", () => {
    expect(roundOffSuggestions(384_990)).toEqual({ down: -990, up: 10 });
    expect(roundOffSuggestions(385_250)).toEqual({ down: -250, up: 750 });
  });

  it("offers nothing either side of a figure already on the step", () => {
    expect(roundOffSuggestions(385_000)).toEqual({ down: 0, up: 0 });
  });

  it("honours a custom step", () => {
    expect(roundOffSuggestions(384_990, 100)).toEqual({ down: -90, up: 10 });
  });
});

/**
 * A family that splits across room types in one stay. The quotation blends them
 * into a single PAX-weighted average, rather than two separate per-person rates.
 */
describe("a mix of rooms in one stay", () => {
  it("spreads one room choice across the whole party (the ordinary case)", () => {
    // Seven people, all Quad: still the plain per-person rate, not seven times it.
    const priced = priceStay(
      { blockId: "blk-pre-makkah", locationId: "loc-makkah", accommodationId: "acc-swiss", ...sharing },
      context,
      7,
    );
    expect(priced.groupTotal).toBe(7 * 150_000);
    expect(priced.lineTotal).toBe(150_000);
    expect(priced.rooms).toHaveLength(1);
    expect(priced.rooms[0]!.headcount).toBe(7);
  });

  it("prices a Sharing + Triple family at one average per person", () => {
    // 4 in a Sharing room, 3 in a Triple room, one Makkah stay.
    const priced = priceStay(
      {
        blockId: "blk-pre-makkah",
        locationId: "loc-makkah",
        accommodationId: "acc-swiss",
        rooms: [
          { accommodationId: "acc-swiss", occupancy: "Sharing", headcount: 4 },
          { accommodationId: "acc-swiss", occupancy: "Triple", headcount: 3 },
        ],
      },
      context,
      7,
    );

    expect(priced.groupTotal).toBe(4 * 150_000 + 3 * 175_000); // 1,125,000
    expect(priced.rooms).toHaveLength(2);
    // One blended figure, not two separate rates.
    const totals = calculateTotals({ stays: [priced], pax: 7 });
    expect(totals.finalTotal).toBe(Math.round(1_125_000 / 7)); // 160,714
  });

  it("blends two different Mina tiers for a two-person party", () => {
    // One Premium tent, one Deluxe tent - different accommodations, one average.
    const priced = priceStay(
      {
        blockId: "blk-hajj-5n",
        locationId: "loc-mina",
        accommodationId: "acc-mina-std",
        rooms: [
          { accommodationId: "acc-mina-std", headcount: 1 },
          { accommodationId: "acc-mina-dlx", headcount: 1 },
        ],
      },
      context,
      2,
    );

    expect(priced.groupTotal).toBe(145_000 + 260_000);
    expect(calculateTotals({ stays: [priced], pax: 2 }).finalTotal).toBe((145_000 + 260_000) / 2);
  });

  it("prices a fifth passenger without a bed at the hotel's no-bed rate", () => {
    // Four sharing, one sharing the room without a bed.
    const priced = priceStay(
      {
        blockId: "blk-pre-makkah",
        locationId: "loc-makkah",
        accommodationId: "acc-swiss",
        rooms: [
          { accommodationId: "acc-swiss", occupancy: "Sharing", headcount: 4 },
          { accommodationId: "acc-swiss", withoutBed: true, headcount: 1 },
        ],
      },
      context,
      5,
    );

    expect(priced.groupTotal).toBe(4 * 150_000 + 1 * 50_000); // 650,000
    expect(calculateTotals({ stays: [priced], pax: 5 }).finalTotal).toBe(650_000 / 5); // 130,000
  });

  it("refuses a without-bed guest when the hotel has no no-bed rate", () => {
    // Sofitel in this block has rates but no withoutBed figure.
    expect(() =>
      priceStay(
        {
          blockId: "blk-pre-madinah",
          locationId: "loc-madinah",
          accommodationId: "acc-sofitel",
          rooms: [{ accommodationId: "acc-sofitel", withoutBed: true, headcount: 1 }],
        },
        context,
        1,
      ),
    ).toThrow(/without bed/i);
  });

  it("keeps the air fare and discount per person across the group", () => {
    const priced = priceStay(
      {
        blockId: "blk-pre-makkah",
        locationId: "loc-makkah",
        accommodationId: "acc-swiss",
        rooms: [
          { accommodationId: "acc-swiss", occupancy: "Sharing", headcount: 4 },
          { accommodationId: "acc-swiss", occupancy: "Double", headcount: 2 },
        ],
      },
      context,
      6,
    );
    // (4*150k + 2*220k)/6 = 173,333.33 per person, + 100k flight, - 20k discount.
    const totals = calculateTotals({ stays: [priced], pax: 6, flightTotal: 100_000, discount: 20_000 });
    const perPerson = (4 * 150_000 + 2 * 220_000) / 6 + 100_000;
    expect(totals.finalTotal).toBe(Math.round(perPerson - 20_000));
  });
});

describe("the PDF must never learn about the discount", () => {
  const priced = priceStays(
    [{ blockId: "blk-hajj-5n", locationId: "loc-mina", accommodationId: "acc-mina-std" }],
    context,
  );

  it("strips the discount out of the PDF payload", () => {
    const totals = calculateTotals({ stays: priced, discount: 45_000 });
    const pdfTotals = toPdfTotals(totals);

    expect(totals.discount).toBe(45_000);
    expect(Object.keys(pdfTotals)).toEqual([
      "totalNights",
      "finalTotal",
      "finalTotalFormatted",
    ]);
    expect(JSON.stringify(pdfTotals)).not.toContain("45000");
    expect(JSON.stringify(pdfTotals)).not.toContain("discount");
  });

  it("shows only the discounted price", () => {
    const totals = calculateTotals({ stays: priced, discount: 45_000 });
    expect(toPdfTotals(totals).finalTotalFormatted).toBe("PKR 100,000 /-");
  });
});

describe("formatPrice", () => {
  it("matches the existing quotation format", () => {
    expect(formatPrice(2_700_000)).toBe("PKR 2,700,000 /-");
    expect(formatPrice(0)).toBe("PKR 0 /-");
  });
});

/**
 * A package prints three prices for one itinerary. Only the Makkah / Madinah
 * hotels move between Quad, Triple and Double; Aziziya and Mina hold their own
 * figure across all three.
 */
describe("priceTiers - a package's three prices", () => {
  const stays: StayInput[] = [
    { blockId: "blk-pre-madinah", locationId: "loc-madinah", accommodationId: "acc-sofitel", ...sharing },
    { blockId: "blk-pre-makkah", locationId: "loc-makkah", accommodationId: "acc-swiss", ...sharing },
    { blockId: "blk-aziziya-2", locationId: "loc-aziziya", accommodationId: "acc-aziziya", roomType: "sharing" },
    { blockId: "blk-hajj-5n", locationId: "loc-mina", accommodationId: "acc-mina-std" },
  ];
  // Aziziya sharing (22k) + Mina flat (145k) sit in every tier unchanged.
  const constant = 22_000 + 145_000;
  const byOccupancy = (t: TierOccupancy) => {
    const value = new Map(priceTiers(stays, context).map((r) => [r.occupancy, r.total])).get(t);
    return value ?? 0;
  };

  it("moves only the hotels between tiers", () => {
    expect(byOccupancy("Quad")).toBe(110_000 + 150_000 + constant);
    expect(byOccupancy("Triple")).toBe(130_000 + 175_000 + constant);
    expect(byOccupancy("Double")).toBe(160_000 + 220_000 + constant);
  });

  it("ignores a hotel stay's own room choice - the tier decides occupancy", () => {
    // The same itinerary with the hotels marked Double still tiers identically.
    const hotels = new Set(["acc-sofitel", "acc-swiss"]);
    const asDouble = stays.map((s) =>
      hotels.has(s.accommodationId)
        ? { ...s, roomType: "sharing" as const, occupancy: "Double" as const }
        : s,
    );
    expect(priceTiers(asDouble, context)).toEqual(priceTiers(stays, context));
  });

  it("returns all three tiers, in order, and flags them complete", () => {
    const tiers = priceTiers(stays, context);
    expect(tiers.map((t) => t.occupancy)).toEqual(["Quad", "Triple", "Double"]);
    expect(tiers.every((t) => t.complete)).toBe(true);
  });

  it("marks a tier incomplete when a hotel has no rate for the block", () => {
    // Sofitel has no rate in the Hajj block, so nothing can be summed for it.
    const missing: StayInput[] = [
      { blockId: "blk-hajj-5n", locationId: "loc-madinah", accommodationId: "acc-sofitel", ...sharing },
    ];
    expect(priceTiers(missing, context).every((t) => t.complete)).toBe(false);
  });
});

describe("finalTierTotal - override and discount per tier", () => {
  it("uses the calculated total when nothing overrides it", () => {
    expect(finalTierTotal(427_000, { manualTotal: null, discount: 0 })).toBe(427_000);
  });

  it("lets a typed-in price win outright, ignoring the discount", () => {
    expect(finalTierTotal(427_000, { manualTotal: 3_650_000, discount: 99_999 })).toBe(3_650_000);
  });

  it("subtracts that tier's own discount from the calculated total", () => {
    expect(finalTierTotal(427_000, { manualTotal: null, discount: 27_000 })).toBe(400_000);
  });

  it("never goes below zero", () => {
    expect(finalTierTotal(427_000, { manualTotal: null, discount: 999_999_999 })).toBe(0);
    expect(finalTierTotal(-10, { manualTotal: null, discount: 0 })).toBe(0);
  });

  it("rounds a typed-in override to a foreign currency's decimals, not the nearest whole unit", () => {
    // A USD package: the manual figure is typed in directly in USD - rounds to
    // cents, not rupees.
    expect(finalTierTotal(1_524.99, { manualTotal: 1_374.965, discount: 0 }, 2)).toBe(1_374.97);
  });

  it("rounds the discount to that same precision before subtracting", () => {
    expect(finalTierTotal(1_600, { manualTotal: null, discount: 74.995 }, 2)).toBe(1_525);
  });
});

/**
 * A hotel that has never been priced for a block has no rate row at all, so
 * the admin screen builds a blank one to type into. Without it a date block
 * added mid-season could never be given a price.
 */
describe("emptyRate", () => {
  const ids = { accommodationId: "acc-sofitel", blockId: "blk-pre-madinah", season: SEASON };

  it("shapes itself to the location's pricing model", () => {
    expect(emptyRate("flat", ids)).toEqual({ ...ids, model: "flat", amount: 0 });
    expect(emptyRate("byOccupancy", ids)).toEqual({
      ...ids,
      model: "byOccupancy",
      rates: { Sharing: 0, Triple: 0, Double: 0 },
      withoutBed: 0,
    });
    expect(emptyRate("sharingOrSeparate", ids)).toEqual({
      ...ids,
      model: "sharingOrSeparate",
      sharing: 0,
      separate: { Sharing: 0, Triple: 0, Double: 0 },
      withoutBed: 0,
    });
  });

  it("covers every occupancy the app offers", () => {
    const rate = emptyRate("byOccupancy", ids);
    expect(Object.keys("rates" in rate ? rate.rates : {})).toEqual([...OCCUPANCIES]);
  });

  it("covers a hotel's own sizes, including one beyond the original three", () => {
    const rate = emptyRate("byOccupancy", ids, ["Quad", "Quint"]);
    expect("rates" in rate ? rate.rates : {}).toEqual({ Quad: 0, Quint: 0 });
  });

  it("prices a stay at nothing rather than throwing", () => {
    const blank = emptyRate("byOccupancy", {
      accommodationId: "acc-sofitel",
      blockId: "blk-pre-madinah",
      season: SEASON,
    });
    const localContext = makePricingContext({
      blocks: resolved,
      accommodations,
      locations,
      rates: [blank],
    });
    const stay: StayInput = {
      blockId: "blk-pre-madinah",
      locationId: "loc-madinah",
      accommodationId: "acc-sofitel",
      roomType: "sharing",
      occupancy: "Sharing",
    };
    expect(priceStay(stay, localContext).lineTotal).toBe(0);
  });
});
