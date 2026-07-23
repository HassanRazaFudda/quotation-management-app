import type { StayInput } from "@junaidi/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { QuotationModel } from "../models/quotation";
import { DEFAULT_SEASON, seed } from "../seed";
import { getConfigBundle } from "../services/config";
import {
  QuotationError,
  changeQuotationStatus,
  createQuotation,
  duplicateQuotation,
  listQuotations,
  priceQuotation,
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

  it("resolves service ids into the labels the PDF prints", async () => {
    const quotation = await createQuotation(baseInput, staff);
    expect(quotation.minaServices.join(" ")).toContain("Gypsum-covered Tents");
    expect(quotation.includes.length).toBeGreaterThan(0);
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
  it("scopes a staff member to their own quotations", async () => {
    const all = await listQuotations({ season: DEFAULT_SEASON });
    const mine = await listQuotations({ season: DEFAULT_SEASON, createdBy: staff.userId });

    expect(mine.total).toBeGreaterThan(0);
    expect(mine.total).toBeLessThan(all.total);
    expect(mine.items.every((q) => String(q.createdBy) === staff.userId)).toBe(true);
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
    expect(hajj.lineTotal).toBeGreaterThan(0);
    // The days are still covered, so the nights match a tented package.
    expect(quotation.totalNights).toBe(8);
  });

  it("refuses a real tent under a without-Mina package", async () => {
    const contradiction: QuotationInput = { ...baseInput, withoutMina: true };
    await expect(createQuotation(contradiction, staff)).rejects.toThrow(QuotationError);
  });
});
