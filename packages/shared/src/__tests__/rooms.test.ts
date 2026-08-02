import { describe, expect, it } from "vitest";

import {
  allocatedHeadcount,
  minaCategoryLabel,
  roomChoiceValue,
  roomChoices,
  roomLabel,
  sharingWordsFor,
} from "../rooms";

/**
 * A shared room is written as "Sharing" rather than a number, because it is
 * usually four but can be five or six. When the group fills whole rooms of one
 * size, that size is offered as an extra wording which prices the same.
 */
describe("sharingWordsFor", () => {
  it("offers the sizes the group fills exactly", () => {
    expect(sharingWordsFor(4)).toEqual(["Quad"]);
    expect(sharingWordsFor(5)).toEqual(["Quint"]);
    expect(sharingWordsFor(6)).toEqual(["Hexa"]);
  });

  it("offers every size a multiple fills", () => {
    expect(sharingWordsFor(8)).toEqual(["Quad"]);
    expect(sharingWordsFor(10)).toEqual(["Quint"]);
    expect(sharingWordsFor(12)).toEqual(["Quad", "Hexa"]);
    // Sixty fills quads, quints and hexas alike.
    expect(sharingWordsFor(60)).toEqual(["Quad", "Quint", "Hexa"]);
  });

  it("offers nothing to a group that fills no room evenly", () => {
    for (const pax of [1, 2, 3, 7, 11, 13]) {
      expect(sharingWordsFor(pax)).toEqual([]);
    }
  });

  it("treats zero guests as not qualifying", () => {
    expect(sharingWordsFor(0)).toEqual([]);
  });
});

describe("roomChoices", () => {
  it("offers Sharing, Triple and Double for a hotel", () => {
    expect(roomChoices("byOccupancy", 2).map((c) => c.label)).toEqual([
      "Sharing",
      "Triple",
      "Double",
      "Without bed",
    ]);
  });

  it("adds the wording the group qualifies for", () => {
    expect(roomChoices("byOccupancy", 6).map((c) => c.label)).toEqual([
      "Sharing",
      "Hexa",
      "Triple",
      "Double",
      "Without bed",
    ]);
    expect(roomChoices("byOccupancy", 12).map((c) => c.label)).toEqual([
      "Sharing",
      "Quad",
      "Hexa",
      "Triple",
      "Double",
      "Without bed",
    ]);
  });

  it("prices every wording as a shared room", () => {
    for (const choice of roomChoices("byOccupancy", 60).filter((c) => c.sharingWord)) {
      expect(choice.roomType).toBe("sharing");
      expect(choice.occupancy).toBe("Quad");
    }
  });

  it("offers Sharing plus a private Triple or Double for Aziziya", () => {
    // A group wanting privacy takes Sharing (quoted at its own size), so there
    // is no Separate Quad.
    expect(roomChoices("sharingOrSeparate", 2).map((c) => c.label)).toEqual([
      "Sharing",
      "Separate - Triple",
      "Separate - Double",
      "Without bed",
    ]);
  });

  it("offers nothing for a Mina tent", () => {
    expect(roomChoices("flat", 4)).toEqual([]);
  });

  /**
   * In a room mix each entry is one explicit room, so a hotel names Quad /
   * Triple / Double outright - Quad no longer hides behind "Sharing", and it
   * appears whatever the party size (here seven, not a multiple of four).
   */
  describe("per-room choices for a mix", () => {
    it("offers Quad, Triple, Double and Without bed for a hotel", () => {
      expect(roomChoices("byOccupancy", 7, [], [], true).map((c) => c.label)).toEqual([
        "Quad",
        "Triple",
        "Double",
        "Without bed",
      ]);
    });

    it("prices the Quad option at the Quad occupancy and prints 'Quad'", () => {
      const quad = roomChoices("byOccupancy", 7, [], [], true).find((c) => c.label === "Quad")!;
      expect(quad.occupancy).toBe("Quad");
      expect(quad.roomType).toBe("sharing");
      expect(roomLabel(quad)).toBe("Quad");
      // Its value round-trips, so the dropdown keeps it selected.
      expect(roomChoiceValue(quad)).toBe(quad.value);
    });

    it("still limits a hotel to the sizes it actually has", () => {
      expect(
        roomChoices("byOccupancy", 7, ["Quad", "Triple"], [], true).map((c) => c.label),
      ).toEqual(["Quad", "Triple", "Without bed"]);
    });

    it("offers Aziziya its shared sizes (Quad/Quint/Hexa) plus Separate rooms", () => {
      expect(roomChoices("sharingOrSeparate", 7, [], [], true).map((c) => c.label)).toEqual([
        "Sharing",
        "Quad",
        "Quint",
        "Hexa",
        "Separate - Triple",
        "Separate - Double",
        "Without bed",
      ]);
    });

    it("prices an Aziziya Quad at the sharing rate but prints 'Quad'", () => {
      const quad = roomChoices("sharingOrSeparate", 7, [], [], true).find((c) => c.label === "Quad")!;
      expect(quad.roomType).toBe("sharing"); // one 'sharing' figure, not per-occupancy
      expect(roomLabel(quad)).toBe("Quad");
      expect(roomChoiceValue(quad)).toBe(quad.value);
    });
  });

  /** A hotel only has the room sizes the admin recorded for it. */
  describe("limited to what the hotel has", () => {
    it("drops the sizes it does not offer", () => {
      expect(roomChoices("byOccupancy", 4, ["Quad", "Triple"]).map((c) => c.label)).toEqual([
        "Sharing",
        "Quad",
        "Triple",
        "Without bed",
      ]);
    });

    it("drops Sharing entirely when there are no quad rooms", () => {
      // The shared figure IS the Quad rate, so without quads there is nothing
      // to share - and no wording for it either.
      expect(roomChoices("byOccupancy", 4, ["Triple", "Double"]).map((c) => c.label)).toEqual([
        "Triple",
        "Double",
        "Without bed",
      ]);
    });

    it("applies to Aziziya too", () => {
      expect(
        roomChoices("sharingOrSeparate", 2, ["Quad", "Double"]).map((c) => c.label),
      ).toEqual(["Sharing", "Separate - Double", "Without bed"]);
    });

    it("treats an empty list as every size, so old data keeps working", () => {
      expect(roomChoices("byOccupancy", 2, [])).toEqual(roomChoices("byOccupancy", 2));
    });
  });

  /**
   * A hotel's shared rooms come in fixed sizes; a group is only offered a
   * wording the hotel actually has, whatever its size makes it eligible for.
   */
  describe("shared-room wordings limited to what the hotel has", () => {
    it("drops a wording the hotel does not offer", () => {
      // Twelve fills quads and hexas, but this hotel has only quad shares.
      expect(
        roomChoices("byOccupancy", 12, ["Quad", "Triple", "Double"], ["Quad"]).map((c) => c.label),
      ).toEqual(["Sharing", "Quad", "Triple", "Double", "Without bed"]);
    });

    it("keeps a wording the hotel does offer", () => {
      expect(
        roomChoices("byOccupancy", 12, ["Quad"], ["Hexa"]).map((c) => c.label),
      ).toEqual(["Sharing", "Hexa", "Without bed"]);
    });

    it("falls back to plain Sharing when the size the group fills is unavailable", () => {
      // Five guests would be a Quint, but this hotel's shares are quad only.
      expect(
        roomChoices("byOccupancy", 5, ["Quad", "Triple", "Double"], ["Quad"]).map((c) => c.label),
      ).toEqual(["Sharing", "Triple", "Double", "Without bed"]);
    });

    it("treats an empty list as every size", () => {
      expect(roomChoices("byOccupancy", 12, ["Quad"], [])).toEqual(
        roomChoices("byOccupancy", 12, ["Quad"]),
      );
    });
  });
});

describe("roomLabel", () => {
  it("says Sharing for a shared room", () => {
    expect(roomLabel({ roomType: "sharing", occupancy: "Quad" })).toBe("Sharing");
  });

  it("says the exact size when the staff chose that wording", () => {
    expect(roomLabel({ roomType: "sharing", occupancy: "Quad", sharingWord: "Quint" })).toBe(
      "Quint",
    );
    expect(roomLabel({ roomType: "sharing", occupancy: "Quad", sharingWord: "Hexa" })).toBe(
      "Hexa",
    );
  });

  it("names the size for Triple and Double", () => {
    expect(roomLabel({ roomType: "sharing", occupancy: "Triple" })).toBe("Triple");
  });

  it("names a separate room with its size", () => {
    expect(roomLabel({ roomType: "separate", occupancy: "Double" })).toBe("Separate - Double");
  });

  it("is empty for a tent", () => {
    expect(roomLabel({})).toBe("");
  });
});

describe("roomChoiceValue round-trips", () => {
  it("matches the choice it came from", () => {
    for (const model of ["byOccupancy", "sharingOrSeparate"] as const) {
      for (const choice of roomChoices(model, 60)) {
        expect(roomChoiceValue(choice)).toBe(choice.value);
      }
    }
  });
});

describe("allocatedHeadcount", () => {
  it("sums the people across a room mix, and is zero without one", () => {
    expect(allocatedHeadcount(undefined)).toBe(0);
    expect(allocatedHeadcount([])).toBe(0);
    expect(
      allocatedHeadcount([
        { accommodationId: "a", occupancy: "Quad", headcount: 4 },
        { accommodationId: "a", occupancy: "Triple", headcount: 3 },
      ]),
    ).toBe(7);
  });
});

describe("minaCategoryLabel", () => {
  it("names a tier from the stored field", () => {
    expect(minaCategoryLabel({ minaTier: "standard" })).toBe("Standard");
    expect(minaCategoryLabel({ minaTier: "deluxe" })).toBe("Deluxe");
    expect(minaCategoryLabel({ minaTier: "premium" })).toBe("Premium");
  });

  it("reads the tier off the tent name when the field is unset", () => {
    expect(minaCategoryLabel({ accommodationName: "Mina Premium B Category" })).toBe("Premium");
  });

  it("names the without-Mina option as its own category", () => {
    expect(minaCategoryLabel({ withoutMina: true, accommodationName: "Without Mina" })).toBe(
      "Without Mina",
    );
  });

  it("falls back to the name when there is no tier", () => {
    expect(minaCategoryLabel({ accommodationName: "Special Camp" })).toBe("Special Camp");
  });
});
