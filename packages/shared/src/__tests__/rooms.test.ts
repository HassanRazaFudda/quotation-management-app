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
      expect(choice.occupancy).toBe("Sharing");
    }
  });

  it("offers Sharing plus a private Triple or Double for Aziziya", () => {
    // A group wanting privacy takes Sharing (quoted at its own size), so there
    // is no Separate Sharing.
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
   * A room mix asks `roomChoices` the same question as the whole-party picker,
   * just with one row's own headcount standing in for `pax` - so a 4-person
   * row can be labelled "Quad" exactly as a 4-person stay can, and a 7-person
   * row (no multiple of 4, 5 or 6) gets no wording at all.
   */
  describe("used per-row inside a mix", () => {
    it("offers Quad wording once the row's own headcount fills one", () => {
      expect(
        roomChoices("byOccupancy", 4, ["Sharing", "Triple"], ["Quad"]).map((c) => c.label),
      ).toContain("Quad");
      expect(
        roomChoices("byOccupancy", 5, ["Sharing", "Triple"], ["Quad"]).map((c) => c.label),
      ).not.toContain("Quad");
    });

    it("offers Aziziya its shared sizes once the row's headcount qualifies", () => {
      expect(roomChoices("sharingOrSeparate", 8, [], []).map((c) => c.label)).toEqual([
        "Sharing",
        "Quad",
        "Separate - Triple",
        "Separate - Double",
        "Without bed",
      ]);
    });
  });

  /** A hotel only has the room sizes the admin recorded for it. */
  describe("limited to what the hotel has", () => {
    it("drops the sizes it does not offer", () => {
      expect(roomChoices("byOccupancy", 4, ["Sharing", "Triple"]).map((c) => c.label)).toEqual([
        "Sharing",
        "Quad",
        "Triple",
        "Without bed",
      ]);
    });

    it("drops Sharing entirely when there is no Sharing rate", () => {
      // The shared figure IS the Sharing rate, so without one there is nothing
      // to share - and no wording for it either.
      expect(roomChoices("byOccupancy", 4, ["Triple", "Double"]).map((c) => c.label)).toEqual([
        "Triple",
        "Double",
        "Without bed",
      ]);
    });

    it("applies to Aziziya too", () => {
      expect(
        roomChoices("sharingOrSeparate", 2, ["Sharing", "Double"]).map((c) => c.label),
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
      // Twelve fills quads and hexas, but this hotel only offers Quad wording.
      expect(
        roomChoices("byOccupancy", 12, ["Sharing", "Triple", "Double"], ["Quad"]).map((c) => c.label),
      ).toEqual(["Sharing", "Quad", "Triple", "Double", "Without bed"]);
    });

    it("treats Quad as an ordinary wording choice, not automatic", () => {
      // Quad is no longer implied by the Sharing rate - it must be explicitly
      // allowed, exactly like Quint or Hexa.
      expect(
        roomChoices("byOccupancy", 12, ["Sharing", "Triple", "Double"], ["Hexa"]).map((c) => c.label),
      ).toEqual(["Sharing", "Hexa", "Triple", "Double", "Without bed"]);
    });

    it("falls back to plain Sharing when the size the group fills is unavailable", () => {
      // Five guests would be a Quint, but this hotel only offers Quad wording.
      expect(
        roomChoices("byOccupancy", 5, ["Sharing", "Triple", "Double"], ["Quad"]).map((c) => c.label),
      ).toEqual(["Sharing", "Triple", "Double", "Without bed"]);
    });

    it("treats an empty list as every size", () => {
      expect(roomChoices("byOccupancy", 12, ["Sharing"], [])).toEqual(
        roomChoices("byOccupancy", 12, ["Sharing"]),
      );
    });
  });

  /**
   * A hotel can offer a size beyond the original three - an admin-added "Quint"
   * priced as its own room, not the Sharing/Quad wording of the same name.
   */
  describe("a hotel with an admin-added size", () => {
    it("prices it as its own room, not as Sharing wording", () => {
      const choices = roomChoices("byOccupancy", 2, ["Sharing", "Quint"]);
      const quint = choices.find((c) => c.label === "Quint");
      expect(quint).toMatchObject({ value: "quint", roomType: "sharing", sharingWord: null });
      // "Sharing" itself is still offered, since it is present.
      expect(choices.map((c) => c.label)).toContain("Sharing");
    });

    it("offers a Separate room in the new size for Aziziya", () => {
      const choices = roomChoices("sharingOrSeparate", 1, ["Sharing", "Quint"]);
      expect(choices.map((c) => c.label)).toContain("Separate - Quint");
    });

    it("still words Quint as Sharing when the hotel has not priced it separately", () => {
      // Only "Sharing" is a priced size here; "Quint" is wording, not its own room.
      const choices = roomChoices("byOccupancy", 5, ["Sharing"], ["Quad", "Quint", "Hexa"]);
      const quint = choices.find((c) => c.label === "Quint");
      expect(quint).toMatchObject({ roomType: "sharing", sharingWord: "Quint" });
    });
  });
});

describe("sharingWordsFor with a custom vocabulary", () => {
  it("checks against the sizes it is given, not the fixed three", () => {
    // A "Septa" word meaning 7, unknown to the original fixed vocabulary.
    expect(sharingWordsFor(7, ["Quad", "Septa"], { Quad: 4, Septa: 7 })).toEqual(["Septa"]);
    expect(sharingWordsFor(8, ["Quad", "Septa"], { Quad: 4, Septa: 7 })).toEqual(["Quad"]);
  });

  it("skips a word with no known size rather than throwing", () => {
    expect(sharingWordsFor(5, ["Mystery"], {})).toEqual([]);
  });
});

describe("roomLabel", () => {
  it("says Sharing for a shared room", () => {
    expect(roomLabel({ roomType: "sharing", occupancy: "Sharing" })).toBe("Sharing");
  });

  it("says the exact size when the staff chose that wording", () => {
    expect(roomLabel({ roomType: "sharing", occupancy: "Sharing", sharingWord: "Quint" })).toBe(
      "Quint",
    );
    expect(roomLabel({ roomType: "sharing", occupancy: "Sharing", sharingWord: "Hexa" })).toBe(
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
