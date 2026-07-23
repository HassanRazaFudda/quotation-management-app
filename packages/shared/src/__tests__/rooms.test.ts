import { describe, expect, it } from "vitest";

import { roomChoiceValue, roomChoices, roomLabel, sharingWordsFor } from "../rooms";

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
    ]);
  });

  it("adds the wording the group qualifies for", () => {
    expect(roomChoices("byOccupancy", 6).map((c) => c.label)).toEqual([
      "Sharing",
      "Hexa",
      "Triple",
      "Double",
    ]);
    expect(roomChoices("byOccupancy", 12).map((c) => c.label)).toEqual([
      "Sharing",
      "Quad",
      "Hexa",
      "Triple",
      "Double",
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
    ]);
  });

  it("offers nothing for a Mina tent", () => {
    expect(roomChoices("flat", 4)).toEqual([]);
  });

  /** A hotel only has the room sizes the admin recorded for it. */
  describe("limited to what the hotel has", () => {
    it("drops the sizes it does not offer", () => {
      expect(roomChoices("byOccupancy", 4, ["Quad", "Triple"]).map((c) => c.label)).toEqual([
        "Sharing",
        "Quad",
        "Triple",
      ]);
    });

    it("drops Sharing entirely when there are no quad rooms", () => {
      // The shared figure IS the Quad rate, so without quads there is nothing
      // to share - and no wording for it either.
      expect(roomChoices("byOccupancy", 4, ["Triple", "Double"]).map((c) => c.label)).toEqual([
        "Triple",
        "Double",
      ]);
    });

    it("applies to Aziziya too", () => {
      expect(
        roomChoices("sharingOrSeparate", 2, ["Quad", "Double"]).map((c) => c.label),
      ).toEqual(["Sharing", "Separate - Double"]);
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
      ).toEqual(["Sharing", "Quad", "Triple", "Double"]);
    });

    it("keeps a wording the hotel does offer", () => {
      expect(
        roomChoices("byOccupancy", 12, ["Quad"], ["Hexa"]).map((c) => c.label),
      ).toEqual(["Sharing", "Hexa"]);
    });

    it("falls back to plain Sharing when the size the group fills is unavailable", () => {
      // Five guests would be a Quint, but this hotel's shares are quad only.
      expect(
        roomChoices("byOccupancy", 5, ["Quad", "Triple", "Double"], ["Quad"]).map((c) => c.label),
      ).toEqual(["Sharing", "Triple", "Double"]);
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
