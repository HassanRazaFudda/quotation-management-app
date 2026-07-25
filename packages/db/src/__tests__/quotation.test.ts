import type { StayInput } from "@junaidi/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { QuotationModel } from "../models/quotation";
import { DEFAULT_SEASON, seed } from "../seed";
import { getConfigBundle } from "../services/config";
import { updateLabelled, upsertDateBlock, upsertRate } from "../services/admin";
import {
  QuotationError,
  buildQuotationDocument,
  changeQuotationStatus,
  createQuotation,
  deleteQuotation,
  duplicateQuotation,
  listQuotations,
  priceQuotation,
  quotationAuthors,
  staffReport,
  updateQuotation,
  type QuotationAuthor,
  type QuotationInput,
} from "../services/quotation";
import { connectTestDb, dropTestDb } from "./setup";

const staff: QuotationAuthor = { userId: "64b000000000000000000001", name: "Bilal", role: "staff" };
const other: QuotationAuthor = { userId: "64b000000000000000000002", name: "Sana", role: "staff" };
const admin: QuotationAuthor = { userId: "64b000000000000000000003", name: "Owner", role: "admin" };

let baseInput: QuotationInput;

beforeAll(async () => {
  await connectTestDb("quotation");
  await seed();

  const bundle = await getConfigBundle(DEFAULT_SEASON);
  const block = (label: string) => {
    const [start, end] = label.split(" - ");
    return bundle.blocks.find(
      (b) =>
        `${String(b.startHijri.day).padStart(2, "0")} ${b.startHijri.month}` === start &&
        `${String(b.endHijri.day).padStart(2, "0")} ${b.endHijri.month}` === end,
    )!;
  };
  const accommodation = (name: string) =>
    bundle.accommodations.find((a) => a.name === name)!;

  const aziziya = accommodation("Aziziya Hotel");
  const mina = accommodation("Mina Standard");

  const stays: StayInput[] = [
    {
      blockId: block("04 Zilhaj - 07 Zilhaj").id,
      locationId: aziziya.locationId,
      accommodationId: aziziya.id,
      roomType: "sharing",
      mealId: aziziya.allowedMealIds[0],
    },
    {
      blockId: block("07 Zilhaj - 12 Zilhaj").id,
      locationId: mina.locationId,
      accommodationId: mina.id,
      mealId: mina.allowedMealIds[0],
    },
  ];

  baseInput = {
    season: DEFAULT_SEASON,
    guest: { name: "Rashid Shahid", pax: 2 },
    date: new Date("2027-01-15"),
    packageTitle: "Hajj 1448 Maktab A - 20 Days",
    stays,
    minaServiceIds: bundle.services
      .filter((s) => s.category === "minaServices")
      .map((s) => s.id),
    includeIds: bundle.services.filter((s) => s.category === "includes").map((s) => s.id),
  };
}, 60_000);

afterAll(async () => {
  await dropTestDb();
});

describe("pricing a quotation", () => {
  it("prices the itinerary and reports the nights", async () => {
    const priced = await priceQuotation(baseInput);
    expect(priced.totalNights).toBe(3 + 5);
    expect(priced.subtotal).toBeGreaterThan(0);
    expect(priced.finalTotal).toBe(priced.subtotal);
  });

  it("refuses an itinerary with errors instead of saving nonsense", async () => {
    const broken: QuotationInput = {
      ...baseInput,
      stays: [{ ...baseInput.stays[0]!, roomType: null }],
    };
    await expect(priceQuotation(broken)).rejects.toBeInstanceOf(QuotationError);
  });

  it("lists warnings without blocking on them", async () => {
    const priced = await priceQuotation(baseInput);
    // The two stays are contiguous, so nothing should be flagged.
    expect(priced.warnings).toEqual([]);
  });
});

/**
 * The client's second example: two pilgrims in one stay, one in a Premium tent
 * and one in a Deluxe tent, quoted as a single average per person.
 */
describe("a mix of rooms in one stay", () => {
  it("blends two Mina tiers into one average per person", async () => {
    const bundle = await getConfigBundle(DEFAULT_SEASON);
    const acc = (name: string) => bundle.accommodations.find((a) => a.name === name)!;
    const standard = acc("Mina Standard");
    const deluxe = acc("Mina Deluxe");
    const minaStay = baseInput.stays[1]!;
    const pair = { name: "Two Pilgrims", pax: 2 };

    const allStandard = await priceQuotation({ ...baseInput, guest: pair });
    const allDeluxe = await priceQuotation({
      ...baseInput,
      guest: pair,
      stays: [baseInput.stays[0]!, { ...minaStay, accommodationId: deluxe.id }],
    });
    const mixed = await priceQuotation({
      ...baseInput,
      guest: pair,
      stays: [
        baseInput.stays[0]!,
        {
          ...minaStay,
          rooms: [
            { accommodationId: standard.id, headcount: 1 },
            { accommodationId: deluxe.id, headcount: 1 },
          ],
        },
      ],
    });

    // Exactly halfway between "everyone Standard" and "everyone Deluxe".
    expect(mixed.finalTotal).toBe(Math.round((allStandard.finalTotal + allDeluxe.finalTotal) / 2));
    expect(mixed.finalTotal).toBeGreaterThan(allStandard.finalTotal);
    expect(mixed.finalTotal).toBeLessThan(allDeluxe.finalTotal);
  });

  it("prices a passenger without a bed lower, and blends them in", async () => {
    // The Aziziya stay: one bedded sharing guest + one without a bed.
    const aziziyaStay = baseInput.stays[0]!;
    const acc = aziziyaStay.accommodationId;

    const bothBedded = await priceQuotation({ ...baseInput, guest: { name: "Pair", pax: 2 } });
    const oneNoBed = await priceQuotation({
      ...baseInput,
      guest: { name: "Pair", pax: 2 },
      stays: [
        {
          ...aziziyaStay,
          rooms: [
            { accommodationId: acc, roomType: "sharing", headcount: 1 },
            { accommodationId: acc, withoutBed: true, headcount: 1 },
          ],
        },
        baseInput.stays[1]!,
      ],
    });

    // The no-bed guest costs less than a bedded one, so the average drops.
    expect(oneNoBed.finalTotal).toBeLessThan(bothBedded.finalTotal);
    expect(oneNoBed.finalTotal).toBeGreaterThan(0);
  });

  it("refuses a without-bed guest where the hotel has no no-bed rate", async () => {
    // Mina tents carry no no-bed figure, so pricing one there is rejected.
    const minaStay = baseInput.stays[1]!;
    await expect(
      priceQuotation({
        ...baseInput,
        guest: { name: "x", pax: 2 },
        stays: [
          baseInput.stays[0]!,
          {
            ...minaStay,
            rooms: [
              { accommodationId: minaStay.accommodationId, headcount: 1 },
              { accommodationId: minaStay.accommodationId, withoutBed: true, headcount: 1 },
            ],
          },
        ],
      }),
    ).rejects.toThrow(/without bed/i);
  });

  it("freezes the mix onto the saved quotation, with a single blended price", async () => {
    const bundle = await getConfigBundle(DEFAULT_SEASON);
    const acc = (name: string) => bundle.accommodations.find((a) => a.name === name)!;
    const minaStay = baseInput.stays[1]!;

    const saved = await createQuotation(
      {
        ...baseInput,
        guest: { name: "Family", pax: 2 },
        stays: [
          baseInput.stays[0]!,
          {
            ...minaStay,
            rooms: [
              { accommodationId: acc("Mina Standard").id, headcount: 1 },
              { accommodationId: acc("Mina Deluxe").id, headcount: 1 },
            ],
          },
        ],
      },
      staff,
    );

    const mixStay = saved.stays.find((s) => s.rooms && s.rooms.length > 1);
    expect(mixStay).toBeTruthy();
    expect(mixStay!.rooms).toHaveLength(2);
    expect(mixStay!.rooms.map((r) => r.accommodationName).sort()).toEqual([
      "Mina Deluxe",
      "Mina Standard",
    ]);
    // An ordinary stay stores no mix.
    const plainStay = saved.stays.find((s) => s.locationType === "aziziya");
    expect(plainStay!.rooms).toHaveLength(0);
  });
});

describe("saving", () => {
  it("numbers quotations per season", async () => {
    const first = await createQuotation(baseInput, staff);
    const second = await createQuotation(baseInput, staff);

    expect(first.quotationId).toMatch(/^HQ-1448-\d{4}$/);
    expect(second.quotationId).not.toBe(first.quotationId);
  });

  it("snapshots names and rates so later edits cannot rewrite it", async () => {
    const quotation = await createQuotation(baseInput, staff);
    const stay = quotation.stays[0]!;

    expect(stay.accommodationName).toBe("Aziziya Hotel");
    expect(stay.blockLabelHijri).toBe("04 Zilhaj - 07 Zilhaj");
    expect(stay.blockLabelGregorian).toBe("10 May - 13 May 2027");
    expect(stay.roomType).toBe("sharing");
    expect(stay.rateSnapshot).toBeGreaterThan(0);
  });

  /**
   * The raw dates too, not just the printed label: the PDF reads the travel
   * dates off the first and last stay, and it cannot parse "10 May - 13 May".
   */
  it("keeps each block's Gregorian dates so the journey can be dated", async () => {
    const quotation = await createQuotation(baseInput, staff);

    expect(quotation.stays[0]!.blockStartGregorian).toBe("2027-05-10");
    expect(quotation.stays.at(-1)!.blockEndGregorian).toBe("2027-05-18");
  });

  /**
   * Aziziya is quoted as "Sharing" rather than "Quad" because a shared room may
   * be four, five or six. Staff can choose to print "Quad" when four guests
   * travel together - a wording change only, never a price change.
   */
  it("freezes the Aziziya wording on the quotation", async () => {
    const quotation = await createQuotation(baseInput, staff);
    const aziziya = quotation.stays.find((s) => s.locationType === "aziziya")!;

    expect(aziziya.roomType).toBe("sharing");
    expect(aziziya.roomLabel).toBe("Sharing");
    expect(aziziya.occupancy).toBeNull();
  });

  it("prints an exact room size instead of Sharing when asked, at the same price", async () => {
    const plain = await createQuotation(baseInput, staff);

    for (const sharingWord of ["Quad", "Quint", "Hexa"] as const) {
      const worded = await createQuotation(
        {
          ...baseInput,
          stays: [{ ...baseInput.stays[0]!, sharingWord }, baseInput.stays[1]!],
        },
        staff,
      );

      expect(worded.stays[0]!.roomLabel).toBe(sharingWord);
      expect(worded.stays[0]!.lineTotal).toBe(plain.stays[0]!.lineTotal);
    }
  });

  it("prices a Separate room by its own occupancy, not the quotation's", async () => {
    // Quotation occupancy is Quad; Aziziya is taken as a Separate Double.
    const separate = await createQuotation(
      {
        ...baseInput,
        stays: [
          {
            ...baseInput.stays[0]!,
            roomType: "separate",
            occupancy: "Double",
          },
          baseInput.stays[1]!,
        ],
      },
      staff,
    );
    const sharing = await createQuotation(baseInput, staff);

    expect(separate.stays[0]!.roomLabel).toBe("Separate - Double");
    expect(separate.stays[0]!.lineTotal).toBeGreaterThan(sharing.stays[0]!.lineTotal);
  });

  it("refuses a Separate room with no occupancy of its own", async () => {
    await expect(
      priceQuotation({
        ...baseInput,
        stays: [
          { ...baseInput.stays[0]!, roomType: "separate", occupancy: null },
          baseInput.stays[1]!,
        ],
      }),
    ).rejects.toBeInstanceOf(QuotationError);
  });

  /**
   * A package may be quoted with or without flights. When included, the fare is
   * added to the total and the sector is frozen onto the quotation.
   */
  it("quotes without flights by default", async () => {
    const quotation = await createQuotation(baseInput, staff);
    expect(quotation.flight!.included).toBe(false);
    expect(quotation.flight!.total).toBe(0);
  });

  it("adds the air fare when flights are included", async () => {
    const bundle = await getConfigBundle(DEFAULT_SEASON);
    const outbound = bundle.flights.find((f) => f.direction === "outbound")!;
    const inbound = bundle.flights.find((f) => f.direction === "inbound")!;

    const without = await createQuotation(baseInput, staff);
    const withFlights = await createQuotation(
      {
        ...baseInput,
        flight: {
          included: true,
          outboundId: outbound.id,
          returnRequired: true,
          inboundId: inbound.id,
        },
      },
      staff,
    );

    expect(withFlights.flight!.total).toBe(outbound.price + inbound.price);
    expect(withFlights.finalTotal).toBe(without.finalTotal + outbound.price + inbound.price);
    expect(withFlights.flight!.outbound!.destination).toBe(outbound.destination);
  });

  it("charges the single fare for a round-trip ticket and fills both legs", async () => {
    const bundle = await getConfigBundle(DEFAULT_SEASON);
    const roundTrip = bundle.flights.find((f) => f.direction === "roundtrip")!;

    const without = await createQuotation(baseInput, staff);
    const quotation = await createQuotation(
      {
        ...baseInput,
        flight: { included: true, roundTrip: true, roundTripId: roundTrip.id, returnRequired: true },
      },
      staff,
    );

    expect(quotation.flight!.total).toBe(roundTrip.price);
    expect(quotation.finalTotal).toBe(without.finalTotal + roundTrip.price);
    // Both legs are recorded so the PDF can show the journey.
    expect(quotation.flight!.outbound!.origin).toBe(roundTrip.origin);
    expect(quotation.flight!.inbound!.destination).toBe(roundTrip.origin);
    expect(quotation.flight!.returnRequired).toBe(true);
  });

  it("charges only the outbound for a one-way package", async () => {
    const bundle = await getConfigBundle(DEFAULT_SEASON);
    const outbound = bundle.flights.find((f) => f.direction === "outbound")!;

    const quotation = await createQuotation(
      { ...baseInput, flight: { included: true, outboundId: outbound.id, returnRequired: false } },
      staff,
    );
    expect(quotation.flight!.total).toBe(outbound.price);
    expect(quotation.flight!.inbound).toBeNull();
  });

  it("refuses an incomplete flight selection", async () => {
    await expect(
      priceQuotation({ ...baseInput, flight: { included: true, returnRequired: true } }),
    ).rejects.toBeInstanceOf(QuotationError);
  });

  it("includes Qurbani unless told otherwise", async () => {
    expect((await createQuotation(baseInput, staff)).qurbaniIncluded).toBe(true);
    expect(
      (await createQuotation({ ...baseInput, qurbaniIncluded: false }, staff)).qurbaniIncluded,
    ).toBe(false);
  });

  it("stores the Mina tier and bed count", async () => {
    const quotation = await createQuotation(baseInput, staff);
    const mina = quotation.stays.find((s) => s.locationType === "mina")!;
    expect(mina.minaTier).toBe("standard");
    expect(mina.bedsPerTent).toBe(16);
  });

  it("freezes each service line's colour and weight onto the quotation", async () => {
    const bundle = await getConfigBundle(DEFAULT_SEASON);
    const service = bundle.services.find((s) => s.category === "includes")!;
    // The admin gives this line a red, bold style.
    await updateLabelled("service", service.id, { color: "#9f0b1f", bold: true });

    const quotation = await createQuotation(baseInput, staff);
    const line = quotation.includes.find((l) => l.text === service.label)!;
    expect(line.color).toBe("#9f0b1f");
    expect(line.bold).toBe(true);

    // Others keep the defaults - black, not bold.
    const plain = quotation.includes.find((l) => l.text !== service.label)!;
    expect(plain.color).toBe("");
    expect(plain.bold).toBe(false);

    // Re-styling the service never rewrites the quotation already sent.
    await updateLabelled("service", service.id, { color: "", bold: false });
    const reread = (await QuotationModel.findById(quotation._id).lean())!;
    expect(reread.includes.find((l) => l.text === service.label)!.color).toBe("#9f0b1f");
  });

  it("keeps the selection ids so the form can be restored on edit or duplicate", async () => {
    const quotation = await createQuotation(baseInput, staff);
    const stay = quotation.stays[0]!;

    // Meal ids alongside the frozen labels.
    expect(String(stay.mealId)).toBe(String(baseInput.stays[0]!.mealId));
    // Service selection ids alongside the styled label lines.
    expect(quotation.minaServiceIds.map(String).sort()).toEqual([...baseInput.minaServiceIds!].sort());
    expect(quotation.includeIds.length).toBe(quotation.includes.length);
  });

  it("resolves service ids into the labels the PDF prints", async () => {
    const quotation = await createQuotation(baseInput, staff);
    expect(quotation.minaServices.map((s) => s.text).join(" ")).toContain("Gypsum-covered Tents");
    expect(quotation.includes.length).toBeGreaterThan(0);
  });
});

/**
 * A guest who keeps their Aziziya room across the Hajj days. The admin builds a
 * block that spans the Hajj days (04 -> 17 Zilhaj), and the Hajj row sits inside
 * it: the hotel is booked for the whole fortnight, the Maktab charged on its own
 * row, and the spanned days counted once.
 */
describe("a stay spanning the Hajj days", () => {
  let spanningInput: QuotationInput;

  beforeAll(async () => {
    const bundle = await getConfigBundle(DEFAULT_SEASON);
    const aziziya = bundle.accommodations.find((a) => a.name === "Aziziya Hotel")!;
    const minaStd = bundle.accommodations.find((a) => a.name === "Mina Standard")!;
    const hajj = bundle.blocks.find((b) => b.phase === "hajj")!; // 07 -> 12 Zilhaj

    // The admin adds the fortnight-long Aziziya block and prices it.
    const covering = await upsertDateBlock(null, {
      season: DEFAULT_SEASON,
      startHijri: { month: "Zilhaj", day: 4 },
      endHijri: { month: "Zilhaj", day: 17 },
      phase: "pre",
      allowedLocationIds: [aziziya.locationId],
      sortOrder: 50,
      active: true,
    });
    const coveringId = String((covering as { _id: unknown })._id);

    await upsertRate(aziziya.id, coveringId, DEFAULT_SEASON, {
      model: "sharingOrSeparate",
      sharing: 95_000,
      separate: { Quad: 140_000, Triple: 165_000, Double: 210_000 },
    });

    spanningInput = {
      ...baseInput,
      guest: { name: "Spanning Guest", pax: 2 },
      stays: [
        {
          blockId: coveringId,
          locationId: aziziya.locationId,
          accommodationId: aziziya.id,
          roomType: "sharing",
          mealId: aziziya.allowedMealIds[0],
        },
        {
          blockId: hajj.id,
          locationId: minaStd.locationId,
          accommodationId: minaStd.id,
          mealId: minaStd.allowedMealIds[0],
        },
      ],
    };
  }, 30_000);

  it("saves without an overlap or gap warning", async () => {
    const priced = await priceQuotation(spanningInput);
    expect(priced.warnings).toEqual([]);
  });

  it("marks the spanning stay, and only it, as covering the Hajj", async () => {
    const doc = await buildQuotationDocument(spanningInput, staff, "HQ-TEST");
    const covering = doc.stays.filter((s) => s.coversHajj);

    expect(covering).toHaveLength(1);
    expect(covering[0]!.locationType).toBe("aziziya");
  });

  it("orders the Hajj row directly after the stay that spans it", async () => {
    const doc = await buildQuotationDocument(spanningInput, staff, "HQ-TEST");
    const types = doc.stays.map((s) => s.locationType);

    expect(types.indexOf("mina")).toBe(types.indexOf("aziziya") + 1);
  });

  it("counts the spanned days once and charges both rows", async () => {
    const doc = await buildQuotationDocument(spanningInput, staff, "HQ-TEST");
    const aziziya = doc.stays.find((s) => s.locationType === "aziziya")!;
    const mina = doc.stays.find((s) => s.locationType === "mina")!;

    expect(aziziya.nights).toBeGreaterThan(0);
    expect(mina.nights).toBe(0); // its days are already in the Aziziya row
    expect(doc.totalNights).toBe(aziziya.nights); // not aziziya + mina
    expect(mina.lineTotal).toBeGreaterThan(0); // the Maktab is still charged
    expect(doc.subtotal).toBe(aziziya.lineTotal + mina.lineTotal);
  });
});

/**
 * The browser prices quotations live for responsiveness, but it is not the
 * authority. Anything it claims about money is recalculated here.
 */
describe("the server does not trust the client's numbers", () => {
  it("ignores a subtotal or total sent by the client", async () => {
    const tampered = {
      ...baseInput,
      subtotal: 1,
      finalTotal: 1,
      totalNights: 999,
    } as QuotationInput;

    const quotation = await createQuotation(tampered, staff);
    const expected = await priceQuotation(baseInput);

    expect(quotation.subtotal).toBe(expected.subtotal);
    expect(quotation.finalTotal).toBe(expected.finalTotal);
    expect(quotation.totalNights).toBe(expected.totalNights);
  });

  it("ignores a rate sent alongside a stay", async () => {
    const tampered: QuotationInput = {
      ...baseInput,
      stays: [
        { ...baseInput.stays[0]!, rateSnapshot: 1, lineTotal: 1 } as StayInput,
        baseInput.stays[1]!,
      ],
    };
    const quotation = await createQuotation(tampered, staff);
    const clean = await priceQuotation(baseInput);

    expect(quotation.stays[0]!.lineTotal).toBe(clean.stays[0]!.lineTotal);
    expect(quotation.stays[0]!.rateSnapshot).toBeGreaterThan(1);
  });
});

describe("the discount", () => {
  it("comes off the total and is kept on the record", async () => {
    const quotation = await createQuotation({ ...baseInput, discount: 40_000, discountNote: "regular customer" }, staff);
    expect(quotation.discount).toBe(40_000);
    expect(quotation.discountNote).toBe("regular customer");
    expect(quotation.finalTotal).toBe(quotation.subtotal - 40_000);
  });

  it("cannot exceed the subtotal", async () => {
    const quotation = await createQuotation({ ...baseInput, discount: 99_999_999 }, staff);
    expect(quotation.finalTotal).toBe(0);
    expect(quotation.discount).toBe(quotation.subtotal);
  });

  it("is overridden by a manual total", async () => {
    const quotation = await createQuotation({ ...baseInput, discount: 40_000, manualTotal: 500_000 }, staff);
    expect(quotation.manualOverride).toBe(true);
    expect(quotation.finalTotal).toBe(500_000);
  });
});

describe("duplicating", () => {
  it("copies the content but takes a new number, today's date and a draft status", async () => {
    const original = await createQuotation({ ...baseInput, status: "sent" }, staff);
    const copy = await duplicateQuotation(String(original._id), other);

    expect(copy.quotationId).not.toBe(original.quotationId);
    expect(copy.status).toBe("draft");
    expect(copy.stays).toHaveLength(original.stays.length);
    expect(copy.finalTotal).toBe(original.finalTotal);
    expect(String(copy.createdBy)).toBe(other.userId);
    expect(copy.createdByName).toBe("Sana");
  });

  it("does not carry the HB number onto the copy", async () => {
    const original = await createQuotation(baseInput, staff);
    await changeQuotationStatus(String(original._id), { status: "confirmed", hbNumber: "HB-DUP-1" }, staff);

    const copy = await duplicateQuotation(String(original._id), staff);
    expect(copy.hbNumber).toBe("");
    expect(copy.status).toBe("draft");
  });
});

describe("deleting", () => {
  it("removes a quotation outright", async () => {
    const quotation = await createQuotation(baseInput, staff);
    const result = await deleteQuotation(String(quotation._id), staff);

    expect(result.ok).toBe(true);
    expect(await QuotationModel.findById(quotation._id)).toBeNull();
  });

  it("lets an admin delete anyone's, but stops staff deleting others'", async () => {
    const mine = await createQuotation(baseInput, staff);
    await expect(deleteQuotation(String(mine._id), other)).rejects.toThrow(/only delete your own/i);

    // The admin can, and it is really gone.
    await deleteQuotation(String(mine._id), admin);
    expect(await QuotationModel.findById(mine._id)).toBeNull();
  });

  it("frees the HB number so it can be used again", async () => {
    const first = await createQuotation(baseInput, staff);
    await changeQuotationStatus(String(first._id), { status: "confirmed", hbNumber: "HB-DEL-1" }, staff);
    await deleteQuotation(String(first._id), staff);

    // The same number now confirms a different booking without clashing.
    const second = await createQuotation(baseInput, staff);
    const confirmed = await changeQuotationStatus(
      String(second._id),
      { status: "confirmed", hbNumber: "HB-DEL-1" },
      staff,
    );
    expect(confirmed.hbNumber).toBe("HB-DEL-1");
  });
});

/**
 * Confirming a booking demands a unique HB (Hajj Booking) number - it is the
 * reference the whole booking is tracked by, so it cannot sit on two.
 */
describe("confirming a booking", () => {
  it("moves plain statuses without asking for anything", async () => {
    const quotation = await createQuotation(baseInput, staff);
    const sent = await changeQuotationStatus(String(quotation._id), { status: "sent" }, staff);
    expect(sent.status).toBe("sent");
    expect(sent.hbNumber).toBe("");
  });

  it("refuses to confirm without an HB number", async () => {
    const quotation = await createQuotation(baseInput, staff);
    await expect(
      changeQuotationStatus(String(quotation._id), { status: "confirmed" }, staff),
    ).rejects.toThrow(/HB number is required/i);
    await expect(
      changeQuotationStatus(String(quotation._id), { status: "confirmed", hbNumber: "   " }, staff),
    ).rejects.toThrow(/HB number is required/i);
  });

  it("confirms and records the HB number", async () => {
    const quotation = await createQuotation(baseInput, staff);
    const confirmed = await changeQuotationStatus(
      String(quotation._id),
      { status: "confirmed", hbNumber: "  HB-1448-9001  " },
      staff,
    );
    expect(confirmed.status).toBe("confirmed");
    expect(confirmed.hbNumber).toBe("HB-1448-9001"); // trimmed
  });

  it("rejects an HB number already used on another booking", async () => {
    const first = await createQuotation(baseInput, staff);
    const second = await createQuotation(baseInput, staff);

    await changeQuotationStatus(String(first._id), { status: "confirmed", hbNumber: "HB-1448-7777" }, staff);
    await expect(
      changeQuotationStatus(String(second._id), { status: "confirmed", hbNumber: "HB-1448-7777" }, staff),
    ).rejects.toThrow(/already used/i);
  });

  it("lets a booking keep its own number when re-confirmed", async () => {
    const quotation = await createQuotation(baseInput, staff);
    await changeQuotationStatus(String(quotation._id), { status: "confirmed", hbNumber: "HB-1448-5555" }, staff);
    // Re-confirming with the same number is not a clash with itself.
    const again = await changeQuotationStatus(
      String(quotation._id),
      { status: "confirmed", hbNumber: "HB-1448-5555" },
      staff,
    );
    expect(again.hbNumber).toBe("HB-1448-5555");
  });

  it("stops staff confirming someone else's booking", async () => {
    const mine = await createQuotation(baseInput, staff);
    await expect(
      changeQuotationStatus(String(mine._id), { status: "confirmed", hbNumber: "HB-X" }, other),
    ).rejects.toThrow(/only change your own/i);
  });
});

describe("ownership", () => {
  it("stops staff editing someone else's quotation", async () => {
    const mine = await createQuotation(baseInput, staff);
    await expect(
      updateQuotation(String(mine._id), baseInput, other),
    ).rejects.toThrow(/only edit your own/i);
  });

  it("lets an admin edit anyone's, without stealing the authorship", async () => {
    const mine = await createQuotation(baseInput, staff);
    const updated = await updateQuotation(
      String(mine._id),
      { ...baseInput, packageTitle: "Edited by admin" },
      admin,
    );

    expect(updated!.packageTitle).toBe("Edited by admin");
    expect(updated!.quotationId).toBe(mine.quotationId);
    expect(String(updated!.createdBy)).toBe(staff.userId);
    expect(updated!.createdByName).toBe("Bilal");
  });
});

describe("listing and reporting", () => {
  /** The bands a list falls into, in the order they appear. */
  const bandsOf = (items: Array<{ groupLabel?: string }>): string[] =>
    items
      .map((item) => item.groupLabel ?? "")
      .filter((label, index, all) => label !== all[index - 1]);

  beforeAll(async () => {
    // A deliberately mixed set: three authors across three months.
    await createQuotation(
      { ...baseInput, date: new Date("2027-03-05"), guest: { name: "Zubair Ali", pax: 1 } },
      other,
    );
    await createQuotation(
      { ...baseInput, date: new Date("2027-04-19"), guest: { name: "Hina Malik", pax: 1 } },
      admin,
    );
  }, 30_000);

  it("shows everyone's work, and narrows to one author on request", async () => {
    const all = await listQuotations({ season: DEFAULT_SEASON });
    const mine = await listQuotations({ season: DEFAULT_SEASON, createdBy: staff.userId });

    expect(mine.total).toBeGreaterThan(0);
    expect(mine.total).toBeLessThan(all.total);
    expect(mine.items.every((q) => String(q.createdBy) === staff.userId)).toBe(true);
  });

  it("orders by the quotation date, either way round", async () => {
    const times = (items: Array<{ date: Date }>) => items.map((q) => new Date(q.date).getTime());

    const newest = await listQuotations({ season: DEFAULT_SEASON, sort: "date-desc", pageSize: 100 });
    const oldest = await listQuotations({ season: DEFAULT_SEASON, sort: "date-asc", pageSize: 100 });

    expect(times(newest.items)).toEqual([...times(newest.items)].sort((a, b) => b - a));
    expect(times(oldest.items)).toEqual([...times(oldest.items)].sort((a, b) => a - b));
    // The set really does span more than one date, or the above proves nothing.
    expect(new Set(times(newest.items)).size).toBeGreaterThan(1);
  });

  it("stamps every row with its band, and never splits a band", async () => {
    for (const groupBy of ["staff", "status", "month"] as const) {
      const list = await listQuotations({ season: DEFAULT_SEASON, groupBy, pageSize: 100 });
      const bands = bandsOf(list.items);

      expect(list.items.every((q) => typeof q.groupLabel === "string")).toBe(true);
      expect(new Set(bands).size).toBe(bands.length); // no band reappears later
      expect(list.items[0]).not.toHaveProperty("groupSort"); // internal, not shipped
    }
  });

  it("bands months newest first and people alphabetically", async () => {
    const months = await listQuotations({ season: DEFAULT_SEASON, groupBy: "month", pageSize: 100 });
    const monthBands = bandsOf(months.items);
    expect(monthBands.length).toBeGreaterThan(1);
    expect(monthBands).toEqual([...monthBands].sort().reverse());

    const staffed = await listQuotations({ season: DEFAULT_SEASON, groupBy: "staff", pageSize: 100 });
    const names = bandsOf(staffed.items);
    expect(names.length).toBeGreaterThan(1);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
  });

  it("bands statuses the way a booking moves, not alphabetically", async () => {
    const list = await listQuotations({ season: DEFAULT_SEASON, groupBy: "status", pageSize: 100 });
    const bands = bandsOf(list.items);

    expect(bands).toEqual(["draft", "sent", "confirmed", "expired"].filter((s) => bands.includes(s)));
  });

  it("names everyone who has written a quotation", async () => {
    const authors = await quotationAuthors(DEFAULT_SEASON);

    expect(authors.map((a) => a.name)).toEqual(expect.arrayContaining(["Bilal", "Owner", "Sana"]));
    expect(authors.every((a) => /^[a-f\d]{24}$/i.test(a.userId))).toBe(true);
  });

  it("searches by guest name and quotation number", async () => {
    const byName = await listQuotations({ search: "Rashid" });
    expect(byName.total).toBeGreaterThan(0);

    const first = byName.items[0]!;
    const byNumber = await listQuotations({ search: first.quotationId });
    expect(byNumber.items[0]!.quotationId).toBe(first.quotationId);
  });

  it("tells the admin who produced what and who discounted", async () => {
    const rows = await staffReport({ season: DEFAULT_SEASON });
    const bilal = rows.find((row) => row.userId === staff.userId)!;

    expect(bilal.name).toBe("Bilal");
    expect(bilal.quotations).toBeGreaterThan(0);
    expect(bilal.discountGiven).toBeGreaterThan(0); // from the discount tests
    expect(await QuotationModel.countDocuments()).toBeGreaterThan(0);
  });
});

/**
 * "Without Mina" is a Mina option like any other: it books no tent, but the
 * Muallim, the transport and Arafat are still sold, so it carries its own rate
 * per block and the Hajj days stay covered.
 */
describe("a package sold without Mina", () => {
  async function withoutMinaInput(): Promise<QuotationInput> {
    const bundle = await getConfigBundle(DEFAULT_SEASON);
    const option = bundle.accommodations.find((a) => a.withoutMina)!;

    return {
      ...baseInput,
      withoutMina: true,
      stays: [
        baseInput.stays[0]!,
        {
          ...baseInput.stays[1]!,
          accommodationId: option.id,
          mealId: option.allowedMealIds[0],
        },
      ],
    };
  }

  it("is offered by the seed as a priced option", async () => {
    const bundle = await getConfigBundle(DEFAULT_SEASON);
    const option = bundle.accommodations.find((a) => a.withoutMina)!;

    expect(option.name).toBe("Without Mina");
    expect(option.minaTier ?? null).toBeNull();
    expect(
      bundle.rates.some((r) => r.accommodationId === option.id && r.model === "flat"),
    ).toBe(true);
  });

  it("prices and saves, charging its own rate for the Hajj days", async () => {
    const quotation = await createQuotation(await withoutMinaInput(), staff);
    const hajj = quotation.stays[1]!;

    expect(quotation.withoutMina).toBe(true);
    expect(hajj.accommodationName).toBe("Without Mina");
    expect(hajj.minaTier).toBeNull();
    // The stay carries its own "books no tent" flag, so the PDF prints the
    // option's name rather than the Maktab.
    expect(hajj.withoutMina).toBe(true);
    expect(hajj.lineTotal).toBeGreaterThan(0);
    // The days are still covered, so the nights match a tented package.
    expect(quotation.totalNights).toBe(8);
  });

  it("refuses a real tent under a without-Mina package", async () => {
    const contradiction: QuotationInput = { ...baseInput, withoutMina: true };
    await expect(createQuotation(contradiction, staff)).rejects.toThrow(QuotationError);
  });
});
