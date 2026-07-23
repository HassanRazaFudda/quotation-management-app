import { describe, expect, it } from "vitest";

import { resolveBlocks } from "../calendar";
import type { StayInput } from "../types";
import {
  hasErrors,
  makeValidationContext,
  nextBlockOptions,
  suggestHajjBlock,
  validateItinerary,
} from "../validation";
import { accommodations, blocks, calendar, locations, meals, mealNotes } from "./fixtures";

const resolved = resolveBlocks(blocks, calendar);

const context = (withoutMina = false) =>
  makeValidationContext({
    blocks: resolved, locations, accommodations, meals, mealNotes, withoutMina,
  });

const codes = (stays: StayInput[], withoutMina = false) =>
  validateItinerary(stays, context(withoutMina)).map((issue) => issue.code);

/** A clean 07->12 Zilhaj itinerary: Aziziya to 07, then the 5-night Hajj. */
const validItinerary: StayInput[] = [
  { blockId: "blk-aziziya-2", locationId: "loc-aziziya", accommodationId: "acc-aziziya", roomType: "sharing", mealId: "meal-3time", mealNoteId: "note-pak" },
  { blockId: "blk-hajj-5n", locationId: "loc-mina", accommodationId: "acc-mina-std", mealId: "meal-3time", mealNoteId: "note-muallim" },
];

describe("a well-formed itinerary", () => {
  it("reports nothing", () => {
    expect(validateItinerary(validItinerary, context())).toEqual([]);
  });

  it("flags an empty itinerary", () => {
    expect(codes([])).toEqual(["NO_STAYS"]);
  });
});

describe("admin configuration is enforced", () => {
  it("rejects a location the block does not allow", () => {
    expect(
      codes([
        { ...validItinerary[0]!, locationId: "loc-makkah", accommodationId: "acc-swiss" },
        validItinerary[1]!,
      ]),
    ).toContain("LOCATION_NOT_ALLOWED");
  });

  it("rejects an accommodation from another location", () => {
    expect(
      codes([{ ...validItinerary[0]!, accommodationId: "acc-swiss" }, validItinerary[1]!]),
    ).toContain("ACCOMMODATION_MISMATCH");
  });

  it("rejects a meal the accommodation does not offer", () => {
    expect(
      codes([{ ...validItinerary[0]!, mealId: "meal-half" }, validItinerary[1]!]),
    ).toContain("MEAL_NOT_ALLOWED");
  });

  it("rejects a meal note the accommodation does not offer", () => {
    expect(
      codes([{ ...validItinerary[0]!, mealNoteId: "note-asian" }, validItinerary[1]!]),
    ).toContain("MEAL_NOTE_NOT_ALLOWED");
  });
});

describe("room choice", () => {
  it("is required", () => {
    expect(
      codes([{ ...validItinerary[0]!, roomType: null }, validItinerary[1]!]),
    ).toContain("MISSING_ROOM_TYPE");
  });

  it("needs an occupancy when the room is Separate", () => {
    expect(
      codes([
        { ...validItinerary[0]!, roomType: "separate", occupancy: null },
        validItinerary[1]!,
      ]),
    ).toContain("MISSING_ROOM_TYPE");
  });

  it("needs no occupancy when the room is Sharing", () => {
    // Sharing is one figure; asking for Quad/Triple/Double would be wrong.
    expect(
      codes([
        { ...validItinerary[0]!, roomType: "sharing", occupancy: null },
        validItinerary[1]!,
      ]),
    ).toEqual([]);
  });

  it("accepts a Separate room with its own occupancy", () => {
    expect(
      codes([
        { ...validItinerary[0]!, roomType: "separate", occupancy: "Double" },
        validItinerary[1]!,
      ]),
    ).toEqual([]);
  });

  it("does not belong on a Mina tent", () => {
    const issues = validateItinerary(
      [
        validItinerary[0]!,
        { ...validItinerary[1]!, roomType: "sharing" }, // Mina: a tent has no room
      ],
      context(),
    );
    const unexpected = issues.find((i) => i.code === "UNEXPECTED_ROOM_TYPE");
    expect(unexpected?.severity).toBe("warning");
  });

  it("is required for a hotel too, not just Aziziya", () => {
    expect(
      codes([
        { blockId: "blk-pre-madinah", locationId: "loc-madinah", accommodationId: "acc-sofitel", mealId: "meal-half" },
        ...validItinerary,
      ]),
    ).toContain("MISSING_ROOM_TYPE");
  });
});

describe("date coverage", () => {
  it("warns about a gap", () => {
    const issues = validateItinerary(
      [
        { blockId: "blk-aziziya-1", locationId: "loc-aziziya", accommodationId: "acc-aziziya", roomType: "sharing", mealId: "meal-3time" },
        { blockId: "blk-makkah-8", locationId: "loc-makkah", accommodationId: "acc-swiss", mealId: "meal-half" },
        { blockId: "blk-hajj-4n", locationId: "loc-mina", accommodationId: "acc-mina-std", mealId: "meal-3time" },
      ],
      context(),
    );
    const gap = issues.find((i) => i.code === "GAP");
    expect(gap?.severity).toBe("warning"); // 04 -> 06 Zilhaj uncovered
  });

  it("errors on overlapping stays", () => {
    expect(
      codes([
        { blockId: "blk-makkah-8", locationId: "loc-makkah", accommodationId: "acc-swiss", mealId: "meal-half" },
        { blockId: "blk-hajj-5n", locationId: "loc-mina", accommodationId: "acc-mina-std", mealId: "meal-3time" },
      ]),
    ).toContain("OVERLAP"); // 06->08 overlaps 07->12
  });
});

describe("the Hajj block rule", () => {
  it("suggests the 5-night Hajj after a stay ending 07 Zilhaj", () => {
    const suggestion = suggestHajjBlock(
      [{ blockId: "blk-aziziya-2", locationId: "loc-aziziya", accommodationId: "acc-aziziya" }],
      context(),
    );
    expect(suggestion?.id).toBe("blk-hajj-5n");
    expect(suggestion?.nights).toBe(5);
  });

  it("suggests the 4-night Hajj after a stay ending 08 Zilhaj", () => {
    const suggestion = suggestHajjBlock(
      [{ blockId: "blk-makkah-8", locationId: "loc-makkah", accommodationId: "acc-swiss" }],
      context(),
    );
    expect(suggestion?.id).toBe("blk-hajj-4n");
    expect(suggestion?.nights).toBe(4);
  });

  it("flags a Hajj block that does not follow the previous stay", () => {
    expect(
      codes([
        { blockId: "blk-aziziya-2", locationId: "loc-aziziya", accommodationId: "acc-aziziya", roomType: "sharing", mealId: "meal-3time" },
        { blockId: "blk-hajj-4n", locationId: "loc-mina", accommodationId: "acc-mina-std", mealId: "meal-3time" },
      ]),
    ).toContain("HAJJ_BLOCK_MISALIGNED");
  });

  it("requires a Hajj block", () => {
    expect(codes([validItinerary[0]!])).toContain("NO_HAJJ_BLOCK");
  });

  it("rejects two Hajj blocks", () => {
    expect(
      codes([
        validItinerary[1]!,
        { blockId: "blk-hajj-4n", locationId: "loc-mina", accommodationId: "acc-mina-std", mealId: "meal-3time" },
      ]),
    ).toContain("MULTIPLE_HAJJ_BLOCKS");
  });
});

/**
 * Some guests do Mina through another Muallim, so the agency books no tent.
 * The Hajj days are usually still sold - the Muallim, the transport and Arafat
 * are charged - which is what the "Without Mina" option is.
 */
describe("without-Mina packages", () => {
  const stays: StayInput[] = [
    { blockId: "blk-aziziya-2", locationId: "loc-aziziya", accommodationId: "acc-aziziya", roomType: "sharing", mealId: "meal-3time" },
    { blockId: "blk-post-aziziya", locationId: "loc-aziziya", accommodationId: "acc-aziziya", roomType: "sharing", mealId: "meal-3time" },
  ];

  const withHajjRow = (accommodationId: string): StayInput[] => [
    stays[0]!,
    { blockId: "blk-hajj-5n", locationId: "loc-mina", accommodationId },
    stays[1]!,
  ];

  it("accepts the Hajj days booked as Without Mina", () => {
    expect(validateItinerary(withHajjRow("acc-no-mina"), context(true))).toEqual([]);
  });

  it("still refuses a real tent under a Without Mina package", () => {
    expect(codes(withHajjRow("acc-mina-std"), true)).toContain("HAJJ_BLOCK_NOT_EXPECTED");
  });

  it("does not mistake Without Mina for a tent missing its tier", () => {
    expect(codes(withHajjRow("acc-no-mina"), true)).not.toContain("MISSING_TIER");
  });

  /** An agency that leaves the days out altogether is allowed too. */
  it("would normally complain about the hole where Mina was", () => {
    expect(codes(stays)).toContain("GAP");
    expect(codes(stays)).toContain("NO_HAJJ_BLOCK");
  });

  it("accepts the same itinerary once Mina is excluded", () => {
    expect(codes(stays, true)).not.toContain("GAP");
    expect(codes(stays, true)).not.toContain("NO_HAJJ_BLOCK");
  });

  /** The bug this replaced: a booked Mina row was dropped from the coverage check. */
  it("never reports a gap across days a booked stay covers", () => {
    for (const excluded of [false, true]) {
      expect(codes(withHajjRow("acc-mina-std"), excluded)).not.toContain("GAP");
    }
  });

  it("still reports a gap that has nothing to do with Mina", () => {
    // Madinah at the start, then straight to the post-Hajj Aziziya block:
    // everything from 25 Zilqad to 12 Zilhaj is missing, not just Mina.
    const disjoint: StayInput[] = [
      { blockId: "blk-pre-madinah", locationId: "loc-madinah", accommodationId: "acc-sofitel", roomType: "sharing", mealId: "meal-half" },
      stays[1]!,
    ];
    expect(codes(disjoint, true)).toContain("GAP");
  });
});

/**
 * The builder offers only blocks that continue the chain, so a gap or an
 * overlap becomes impossible to pick rather than something reported afterwards.
 */
describe("nextBlockOptions", () => {
  it("offers every block when nothing is chosen yet", () => {
    expect(nextBlockOptions([], resolved)).toHaveLength(resolved.length);
  });

  it("offers only blocks starting where the last one ended", () => {
    // 01 -> 04 Zilhaj was taken, so the next must start on 04 Zilhaj.
    const next = nextBlockOptions(["blk-aziziya-1"], resolved);
    expect(next.map((b) => b.label)).toEqual(["04 Zilhaj - 07 Zilhaj"]);
    // 06 Zilhaj starts mid-gap and must not be offered.
    expect(next.map((b) => b.id)).not.toContain("blk-makkah-8");
  });

  it("leads to a single Hajj block after a stay ending 07 Zilhaj", () => {
    const next = nextBlockOptions(["blk-aziziya-2"], resolved);
    expect(next.map((b) => b.label)).toEqual(["07 Zilhaj - 12 Zilhaj"]);
  });

  it("leads to the 4-night Hajj after a stay ending 08 Zilhaj", () => {
    const next = nextBlockOptions(["blk-makkah-8"], resolved);
    expect(next.map((b) => b.label)).toEqual(["08 Zilhaj - 12 Zilhaj"]);
  });

  it("never offers a block already used", () => {
    const next = nextBlockOptions(["blk-aziziya-1", "blk-aziziya-2"], resolved);
    expect(next.map((b) => b.id)).not.toContain("blk-aziziya-2");
  });

  it("chains from the furthest point, not the last added", () => {
    // Added out of order; the chain still continues from 12 Zilhaj.
    const next = nextBlockOptions(["blk-hajj-5n", "blk-aziziya-2"], resolved);
    expect(next.every((b) => b.label.startsWith("12 Zilhaj"))).toBe(true);
  });
});

describe("hasErrors", () => {
  it("ignores warnings", () => {
    expect(hasErrors([{ severity: "warning", code: "GAP", message: "" }])).toBe(false);
    expect(hasErrors([{ severity: "error", code: "OVERLAP", message: "" }])).toBe(true);
  });
});

/** Not every hotel has every room size, and the admin records which it has. */
describe("room sizes a hotel actually offers", () => {
  const stay = (occupancy: "Quad" | "Triple" | "Double"): StayInput => ({
    blockId: "blk-pre-makkah",
    locationId: "loc-makkah",
    accommodationId: "acc-markazia",
    roomType: "sharing",
    occupancy,
    mealId: "meal-half",
  });

  it("accepts a size the hotel has", () => {
    expect(codes([stay("Triple")])).not.toContain("OCCUPANCY_NOT_ALLOWED");
  });

  it("refuses one it does not", () => {
    // 3 Star Markazia has Quad and Triple rooms only.
    expect(codes([stay("Double")])).toContain("OCCUPANCY_NOT_ALLOWED");
  });

  it("leaves a hotel with no list alone, so old data keeps working", () => {
    const anywhere: StayInput = {
      blockId: "blk-pre-makkah",
      locationId: "loc-makkah",
      accommodationId: "acc-swiss",
      roomType: "sharing",
      occupancy: "Double",
      mealId: "meal-half",
    };
    expect(codes([anywhere])).not.toContain("OCCUPANCY_NOT_ALLOWED");
  });
});
