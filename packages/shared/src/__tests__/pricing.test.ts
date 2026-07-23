import { describe, expect, it } from "vitest";

import { resolveBlocks } from "../calendar";
import {
  PricingError,
  calculateTotals,
  formatPrice,
  makePricingContext,
  priceStay,
  priceStays,
  toPdfTotals,
} from "../pricing";
import { OCCUPANCIES, emptyRate, type StayInput } from "../types";
import { SEASON, accommodations, blocks, calendar, locations, rates } from "./fixtures";

const resolved = resolveBlocks(blocks, calendar);
const context = makePricingContext({
  blocks: resolved,
  accommodations,
  locations,
  rates,
});

/** A stay's room travels with the stay, not with the quotation. */
const sharing = { roomType: "sharing", occupancy: "Quad" } as const;

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

  it("uses the Quad rate for a shared room", () => {
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
      rates: { Quad: 0, Triple: 0, Double: 0 },
    });
    expect(emptyRate("sharingOrSeparate", ids)).toEqual({
      ...ids,
      model: "sharingOrSeparate",
      sharing: 0,
      separate: { Quad: 0, Triple: 0, Double: 0 },
    });
  });

  it("covers every occupancy the app offers", () => {
    const rate = emptyRate("byOccupancy", ids);
    expect(Object.keys("rates" in rate ? rate.rates : {})).toEqual([...OCCUPANCIES]);
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
      occupancy: "Quad",
    };
    expect(priceStay(stay, localContext).lineTotal).toBe(0);
  });
});
