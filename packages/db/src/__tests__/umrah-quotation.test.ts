import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { UmrahQuotationModel } from "../models/umrah-quotation";
import {
  UmrahQuotationError,
  buildUmrahQuotationDocument,
  changeUmrahQuotationStatus,
  createUmrahQuotation,
  deleteUmrahQuotation,
  getUmrahQuotation,
  listUmrahQuotations,
  umrahQuotationAuthors,
  updateUmrahQuotation,
  type UmrahAuthor,
  type UmrahQuotationInput,
} from "../services/umrah-quotation";
import { addUmrahPayment, deleteUmrahPayment, updateUmrahPayment } from "../services/umrah-payment";
import { UMRAH_FALLBACK_SETTINGS, getUmrahSettings, updateUmrahSettings } from "../services/umrah-settings";
import { connectTestDb, dropTestDb } from "./setup";

const staff: UmrahAuthor = { userId: "64b000000000000000000001", name: "Bilal", role: "staff" };
const other: UmrahAuthor = { userId: "64b000000000000000000002", name: "Sana", role: "staff" };
const admin: UmrahAuthor = { userId: "64b000000000000000000003", name: "Owner", role: "admin" };
const actor = { userId: staff.userId, name: staff.name };

function input(overrides: Partial<UmrahQuotationInput> = {}): UmrahQuotationInput {
  return {
    guest: { name: "Rashid Shahid", pax: 4, withoutBedPax: 0, infants: 0 },
    date: new Date("2026-11-20"),
    packageTitle: "Umrah Package",
    pricingMode: "single",
    priceDisplay: "average",
    transportDisplay: "included",
    currency: { code: "PKR", symbol: "PKR", decimals: 0 },
    exchangeRates: [{ code: "SAR", rate: 75 }],
    stays: [
      {
        city: "Makkah",
        hotelName: "Emaar Al Khalil",
        distance: "500 mtrs",
        checkIn: "2026-12-12",
        checkOut: "2026-12-19",
        meal: "",
        currencyCode: "SAR",
        rateBasis: "room",
        rooms: [{ roomType: "Quad", rooms: 1, persons: 4, rate: 300 }],
        tierRates: { Quad: null, Triple: null, Double: null },
        withoutBedRate: 0,
      },
    ],
    transportLegs: [],
    flight: { included: false, airline: "", outbound: "", inbound: "", adultFare: 0, infantFare: 0, currencyCode: "PKR" },
    charges: [],
    lineSettings: [],
    ...overrides,
  };
}

const tieredInput = (): UmrahQuotationInput =>
  input({
    pricingMode: "tiered",
    stays: [
      {
        ...input().stays[0]!,
        rooms: [],
        tierRates: { Quad: 400, Triple: 360, Double: 300 },
      },
    ],
  });

beforeAll(async () => {
  await connectTestDb("umrah");
  await UmrahQuotationModel.init();
});

afterEach(async () => {
  await UmrahQuotationModel.deleteMany({});
});

afterAll(async () => {
  await dropTestDb();
});

describe("creating", () => {
  it("numbers quotations by year and counts up", async () => {
    const first = await createUmrahQuotation(input(), staff);
    const second = await createUmrahQuotation(input(), staff);
    const next = await createUmrahQuotation(input({ date: new Date("2027-01-05") }), staff);

    expect(first.quotationId).toBe("UQ-2026-0001");
    expect(second.quotationId).toBe("UQ-2026-0002");
    expect(next.quotationId).toBe("UQ-2027-0001");
    expect(first.year).toBe("2026");
  });

  it("recomputes every figure itself and freezes it", async () => {
    const quotation = await createUmrahQuotation(input(), staff);

    // 300 SAR x 7 nights = 2,100 SAR = 157,500 PKR, over 4 people.
    expect(quotation.stays[0]!.nights).toBe(7);
    expect(quotation.totalNights).toBe(7);
    expect(quotation.grandTotal).toBe(157_500);
    expect(quotation.finalTotal).toBe(39_375);
    expect(quotation.priceLines).toHaveLength(1);
    expect(quotation.status).toBe("draft");
    expect(quotation.createdByName).toBe("Bilal");
  });

  it("refuses an itinerary that cannot be priced, listing why", async () => {
    const bad = input();
    bad.stays[0]!.checkOut = "2026-12-10";

    await expect(createUmrahQuotation(bad, staff)).rejects.toBeInstanceOf(UmrahQuotationError);
    await expect(createUmrahQuotation(bad, staff)).rejects.toMatchObject({
      issues: [expect.stringContaining("check-out must be after check-in")],
    });
    expect(await UmrahQuotationModel.countDocuments()).toBe(0);
  });

  it("keeps only the rates the pricing mode uses", async () => {
    const stray = input();
    stray.stays[0]!.tierRates = { Quad: 999, Triple: 999, Double: 999 };
    const single = await createUmrahQuotation(stray, staff);
    expect(single.stays[0]!.tierRates).toMatchObject({ Quad: null, Triple: null, Double: null });

    const tiered = tieredInput();
    tiered.stays[0]!.rooms = [{ roomType: "Quad", rooms: 1, persons: 4, rate: 999 }];
    const saved = await createUmrahQuotation(tiered, staff);
    expect(saved.stays[0]!.rooms).toHaveLength(0);
    expect(saved.priceLines.map((l) => l.key)).toEqual(["Quad", "Triple", "Double"]);
  });

  it("carries the internal discount only in its own fields", async () => {
    const quotation = await createUmrahQuotation(
      input({ lineSettings: [{ key: "main", discount: 1_000, roundOff: 0, manualTotal: null }], discountNote: "repeat customer" }),
      staff,
    );
    expect(quotation.priceLines[0]).toMatchObject({ subtotal: 39_375, discount: 1_000, finalTotal: 38_375 });
    expect(quotation.discountNote).toBe("repeat customer");
  });

  it("builds a preview document without saving", () => {
    const doc = buildUmrahQuotationDocument(input(), staff, "UQ-PREVIEW");
    expect(doc.quotationId).toBe("UQ-PREVIEW");
    expect(doc.finalTotal).toBe(39_375);
  });
});

describe("editing and deleting", () => {
  it("lets the author edit but keeps the number, author and status", async () => {
    const created = await createUmrahQuotation(input(), staff);
    const edited = await updateUmrahQuotation(String(created._id), input({ guest: { name: "New Name", pax: 4, withoutBedPax: 0, infants: 0 } }), staff);

    expect(edited!.guest!.name).toBe("New Name");
    expect(edited!.quotationId).toBe(created.quotationId);
    expect(String(edited!.createdBy)).toBe(staff.userId);
    expect(edited!.status).toBe("draft");
  });

  it("stops another staff member editing or deleting, but not an admin", async () => {
    const created = await createUmrahQuotation(input(), staff);
    const id = String(created._id);

    await expect(updateUmrahQuotation(id, input(), other)).rejects.toThrow("only edit your own");
    await expect(deleteUmrahQuotation(id, other)).rejects.toThrow("only delete your own");
    await expect(changeUmrahQuotationStatus(id, { status: "sent" }, other)).rejects.toThrow("only change your own");

    const byAdmin = await updateUmrahQuotation(id, input(), admin);
    expect(String(byAdmin!.createdBy)).toBe(staff.userId); // authorship is not taken over
    await deleteUmrahQuotation(id, admin);
    expect(await UmrahQuotationModel.countDocuments()).toBe(0);
  });

  it("treats a malformed id as not found rather than crashing", async () => {
    expect(await getUmrahQuotation("not-an-id")).toBeNull();
    await expect(updateUmrahQuotation("not-an-id", input(), staff)).rejects.toThrow("Quotation not found.");
    await expect(deleteUmrahQuotation("not-an-id", staff)).rejects.toThrow("Quotation not found.");
  });
});

describe("status", () => {
  it("needs a booking number to confirm, and stores it", async () => {
    const created = await createUmrahQuotation(input(), staff);
    const id = String(created._id);

    await expect(changeUmrahQuotationStatus(id, { status: "confirmed" }, staff)).rejects.toThrow("booking number is required");

    const confirmed = await changeUmrahQuotationStatus(
      id,
      { status: "confirmed", bookingRef: "UB-001", assignedStaffName: "Hamid" },
      staff,
    );
    expect(confirmed.status).toBe("confirmed");
    expect(confirmed.bookingRef).toBe("UB-001");
    expect(confirmed.assignedStaff?.name).toBe("Hamid");
  });

  it("will not let two bookings share a number", async () => {
    const a = await createUmrahQuotation(input(), staff);
    const b = await createUmrahQuotation(input(), staff);
    await changeUmrahQuotationStatus(String(a._id), { status: "confirmed", bookingRef: "UB-001" }, staff);

    await expect(
      changeUmrahQuotationStatus(String(b._id), { status: "confirmed", bookingRef: "UB-001" }, staff),
    ).rejects.toThrow('already used on');
  });

  it("cannot confirm a room-types quotation", async () => {
    const created = await createUmrahQuotation(tieredInput(), staff);
    await expect(
      changeUmrahQuotationStatus(String(created._id), { status: "confirmed", bookingRef: "UB-002" }, staff),
    ).rejects.toThrow("separate room-type prices cannot be confirmed");

    // Switching to Single lets it through.
    await updateUmrahQuotation(String(created._id), input(), staff);
    const confirmed = await changeUmrahQuotationStatus(String(created._id), { status: "confirmed", bookingRef: "UB-002" }, staff);
    expect(confirmed.status).toBe("confirmed");
  });

  it("cannot be edited back into room types once confirmed", async () => {
    const created = await createUmrahQuotation(input(), staff);
    await changeUmrahQuotationStatus(String(created._id), { status: "confirmed", bookingRef: "UB-003" }, staff);
    await expect(updateUmrahQuotation(String(created._id), tieredInput(), staff)).rejects.toThrow("cannot show separate room-type prices");
  });

  it("keeps a confirmed booking's status and number through an edit", async () => {
    const created = await createUmrahQuotation(input(), staff);
    await changeUmrahQuotationStatus(String(created._id), { status: "confirmed", bookingRef: "UB-004" }, staff);
    const edited = await updateUmrahQuotation(String(created._id), input({ packageTitle: "Changed" }), staff);
    expect(edited!.status).toBe("confirmed");
    expect(edited!.bookingRef).toBe("UB-004");
  });
});

describe("payments", () => {
  async function confirmed() {
    const created = await createUmrahQuotation(input(), staff);
    return changeUmrahQuotationStatus(String(created._id), { status: "confirmed", bookingRef: `UB-${Math.random()}` }, staff);
  }

  it("is only recordable on a confirmed booking", async () => {
    const created = await createUmrahQuotation(input(), staff);
    await expect(
      addUmrahPayment(String(created._id), { date: "2026-12-01", amount: 1000, receivedByName: "Hamid" }, actor),
    ).rejects.toThrow("confirmed booking");
  });

  it("records, corrects and removes a payment, freezing the conversion", async () => {
    const booking = await confirmed();
    const id = String(booking._id);

    const added = await addUmrahPayment(
      id,
      { date: "2026-12-01", amount: 100, paymentCurrency: "SAR", exchangeRate: 75, method: "Cash", receivedByName: "Hamid" },
      actor,
    );
    expect(added.payments).toHaveLength(1);
    expect(added.payments[0]!.convertedAmount).toBe(7_500);
    expect(added.payments[0]!.recordedByName).toBe("Bilal");

    const paymentId = String((added.payments[0] as any)._id);
    const updated = await updateUmrahPayment(id, paymentId, { date: "2026-12-02", amount: 200, paymentCurrency: "SAR", exchangeRate: 75, receivedByName: "Hamid" }, actor);
    expect(updated.payments[0]!.convertedAmount).toBe(15_000);

    const removed = await deleteUmrahPayment(id, paymentId);
    expect(removed.payments).toHaveLength(0);
  });

  it("rejects a zero amount and an unknown payer", async () => {
    const booking = await confirmed();
    const id = String(booking._id);
    await expect(addUmrahPayment(id, { date: "2026-12-01", amount: 0, receivedByName: "Hamid" }, actor)).rejects.toThrow("greater than zero");
    await expect(addUmrahPayment(id, { date: "2026-12-01", amount: 10 }, actor)).rejects.toThrow("who received");
  });
});

describe("listing", () => {
  it("filters by status and author, searches booking numbers, and pages", async () => {
    const a = await createUmrahQuotation(input({ guest: { name: "Alpha Khan", pax: 4, withoutBedPax: 0, infants: 0 } }), staff);
    await createUmrahQuotation(input({ guest: { name: "Beta Ali", pax: 4, withoutBedPax: 0, infants: 0 } }), other);
    await changeUmrahQuotationStatus(String(a._id), { status: "confirmed", bookingRef: "UB-777" }, staff);

    expect((await listUmrahQuotations({})).total).toBe(2);
    expect((await listUmrahQuotations({ status: "confirmed" })).items.map((q) => q.guest.name)).toEqual(["Alpha Khan"]);
    expect((await listUmrahQuotations({ createdBy: other.userId })).items.map((q) => q.guest.name)).toEqual(["Beta Ali"]);
    expect((await listUmrahQuotations({ search: "UB-777" })).total).toBe(1);
    expect((await listUmrahQuotations({ search: "beta" })).total).toBe(1);
    expect((await listUmrahQuotations({ search: ".*" })).total).toBe(0); // regex characters are literal

    const page = await listUmrahQuotations({ pageSize: 1, page: 2 });
    expect(page).toMatchObject({ total: 2, pages: 2, page: 2 });
    expect(page.items).toHaveLength(1);
  });

  it("bands the list when asked", async () => {
    await createUmrahQuotation(input(), staff);
    await createUmrahQuotation(input(), other);
    const grouped = await listUmrahQuotations({ groupBy: "staff" });
    expect(new Set(grouped.items.map((q: any) => q.groupLabel))).toEqual(new Set(["Bilal", "Sana"]));
  });

  it("lists who has produced quotations", async () => {
    await createUmrahQuotation(input(), staff);
    await createUmrahQuotation(input(), other);
    expect((await umrahQuotationAuthors()).map((a) => a.name)).toEqual(["Bilal", "Sana"]);
  });
});

describe("settings", () => {
  it("falls back until an admin saves, then returns what was saved", async () => {
    expect(await getUmrahSettings()).toEqual(UMRAH_FALLBACK_SETTINGS);

    const saved = await updateUmrahSettings(
      {
        company: {
          name: "Junaidi A Travel",
          subheading: "",
          tagline: "",
          address: "Karachi",
          contact: "Phone: 021-111",
          social: { facebook: "", instagram: "", youtube: "", whatsapp: "+92 300 1234567" },
        },
        defaults: { includes: [{ text: "Umrah visa", color: "", bold: false }], requirements: [], terms: [] },
      },
      admin.userId,
    );
    expect(saved.company.name).toBe("Junaidi A Travel");
    expect(saved.company.social.whatsapp).toBe("+92 300 1234567");
    expect(saved.defaults.includes[0]!.text).toBe("Umrah visa");
    expect(saved.defaults.terms).toEqual([]);

    const again = await updateUmrahSettings({ ...saved, company: { ...saved.company, address: "Lahore" } }, admin.userId);
    expect(again.company.address).toBe("Lahore");
  });
});
