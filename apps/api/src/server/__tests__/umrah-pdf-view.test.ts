/**
 * The Umrah bridge to the PDF must hold the same line the Hajj one does: no
 * discount, subtotal or round-off can reach the page, whatever the stored
 * document carries.
 */

import { buildHtml } from "@junaidi/pdf";
import { describe, expect, it } from "vitest";

import { toUmrahPdfView, umrahPdfFilename } from "../umrah-pdf-view";

const company = {
  name: "JUNAIDI A TRAVEL",
  subheading: "",
  tagline: "",
  address: "Karachi",
  contact: "Phone: 021-111",
  social: { facebook: "", instagram: "", youtube: "", whatsapp: "+92 300 1234567" },
};

const quotation = {
  quotationId: "UQ-2026-0007",
  bookingRef: "",
  date: "2026-11-20",
  validUntil: "2026-11-27",
  packageTitle: "Umrah Package - 20 Nights",
  guest: { name: "Rashid Shahid", pax: 3, withoutBedPax: 1, infants: 1 },
  transportDisplay: "included" as const,
  currency: { code: "PKR", symbol: "PKR", decimals: 0 },
  stays: [
    {
      city: "Madinah",
      hotelName: "Safwat Al Madinah",
      distance: "200 mtrs",
      checkIn: "2026-12-10",
      checkOut: "2026-12-12",
      nights: 2,
      meal: "Breakfast",
      rateBasis: "room" as const,
      rooms: [
        { roomType: "Quad", rooms: 1, persons: 2 },
        { roomType: "Double", rooms: 1, persons: 1 },
      ],
    },
    {
      city: "Makkah",
      hotelName: "Emaar Al Khalil",
      checkIn: "2026-12-12",
      checkOut: "2026-12-19",
      nights: 7,
      rateBasis: "person" as const,
      rooms: [{ roomType: "Suite", rooms: 1, persons: 3 }],
    },
  ],
  transportLegs: [
    { route: "Madinah to Makkah", vehicle: "Private Staria", cost: 117_000 },
    { route: "Makkah to Jeddah Airport", vehicle: "", cost: 25_000 },
  ],
  transportTotal: 142_000,
  flight: { included: true, airline: "Emirates", outbound: "KHI - MED", inbound: "JED - KHI" },
  charges: [{ label: "Umrah visa", amount: 25_000 }, { label: "Ziyarat", amount: 5_000 }],
  priceLines: [
    { key: "main", label: "Per Person (With Bed)", finalTotal: 228_000 },
    { key: "withoutBed", label: "Per Person (Without Bed)", finalTotal: 150_000 },
    { key: "infant", label: "Per Infant", finalTotal: 38_000 },
  ],
  includes: [{ text: "Hotel accommodation" }],
  requirements: [],
  terms: [{ text: "All above rates are subject to availability." }],
  remarks: "",
  createdByName: "Bilal Ahmed",

  // Internal figures that must never surface.
  subtotal: 291_000,
  discount: 63_000,
  roundOff: -321,
  discountNote: "repeat customer, do not print",
  lineSettings: [{ key: "main", discount: 63_000, roundOff: -321, manualTotal: null }],
};

describe("toUmrahPdfView", () => {
  it("carries no field capable of holding the discount", async () => {
    const view = await toUmrahPdfView(quotation as never, { company });
    const keys = Object.keys(view);
    for (const forbidden of ["discount", "discountNote", "subtotal", "roundOff", "lineSettings"]) {
      expect(keys).not.toContain(forbidden);
    }
  });

  it("produces HTML with no trace of the discount, subtotal or round-off", async () => {
    const html = buildHtml(await toUmrahPdfView(quotation as never, { company }));
    for (const hidden of ["63000", "63,000", "291000", "291,000", "321", "repeat customer"]) {
      expect(html).not.toContain(hidden);
    }
    expect(html.toLowerCase()).not.toContain("discount");
    expect(html).toContain("PKR 228,000 /-");
  });

  it("keeps the signature line exactly as it always reads", async () => {
    const html = buildHtml(await toUmrahPdfView(quotation as never, { company }));
    expect(html).toContain("<span>Authorised Signature</span>");
    expect(html).toContain("<span>Guest Signature</span>");
  });

  it("uses the Umrah wording and the letterhead from the settings", async () => {
    const view = await toUmrahPdfView({ ...quotation, bookingRef: "UB-12" } as never, { company });
    const html = buildHtml(view);
    expect(view.labels).toEqual({ bookingRef: "Booking No.", phaseHeader: "City", accommodationHeader: "Hotel / Rooms" });
    expect(html).toContain("Booking No.:");
    expect(html).not.toContain("HB Number");
    expect(html).toContain(">JUNAIDI</span>");
    expect(html).toContain(">A TRAVEL</span>");
    expect(html).toContain("https://wa.me/923001234567");
    expect(html).not.toContain("Maktab");
    expect(html).not.toContain("Qurbani");
  });

  it("prints the party, the dates and the flight", async () => {
    const view = await toUmrahPdfView(quotation as never, { company });
    expect(view.guestName).toBe("Rashid Shahid * 03 PAX + 01 WITHOUT BED + 01 INF");
    expect(view.travel).toMatchObject({
      included: true,
      departureDate: "10 December 2026",
      returnDate: "19 December 2026",
      outbound: "KHI - MED (Emirates)",
      inbound: "JED - KHI (Emirates)",
      note: "",
    });
  });

  it("names each hotel with its rooms, distance and without-bed guests", async () => {
    const view = await toUmrahPdfView(quotation as never, { company });
    expect(view.stays[0]).toMatchObject({
      phase: "Madinah",
      nights: "02 Nights",
      meal: "Breakfast",
      accommodation: "Safwat Al Madinah (1x Quad + 1x Double + 01 Without Bed) · 200 mtrs",
    });
    // A per-person rate names the room with how many it holds.
    expect(view.stays[1]!.accommodation).toBe("Emaar Al Khalil (Suite [03] + 01 Without Bed)");
  });

  it("lists transport without prices when it is inside the package price", async () => {
    const view = await toUmrahPdfView(quotation as never, { company });
    const html = buildHtml(view);
    expect(view.transport).toEqual([
      { route: "Madinah to Makkah", vehicle: "Private Staria" },
      { route: "Makkah to Jeddah Airport", vehicle: "" },
    ]);
    expect(view.addOns).toEqual([]);
    expect(html).not.toContain("117,000");
    expect(html).not.toContain("142,000");
  });

  it("shows transport as its own charge when the agent chose that", async () => {
    const view = await toUmrahPdfView({ ...quotation, transportDisplay: "separate" } as never, { company });
    expect(view.addOns).toEqual([{ label: "Transportation Charges", amountFormatted: "PKR 142,000 /-" }]);
  });

  it("prints each price, and extra charges by name only", async () => {
    const view = await toUmrahPdfView(quotation as never, { company });
    expect(view.tierPrices.map((t) => t.label)).toEqual([
      "Per Person (With Bed)",
      "Per Person (Without Bed)",
      "Per Infant",
    ]);
    expect(view.includes.map((l) => l.text)).toEqual(["Umrah visa", "Ziyarat", "Hotel accommodation"]);
    const html = buildHtml(view);
    expect(html).not.toContain("25,000");
  });

  it("prints a charge name once when it is charged twice (visa per adult and per infant)", async () => {
    const view = await toUmrahPdfView(
      {
        ...quotation,
        charges: [{ label: "Umrah visa", amount: 25_000 }, { label: "umrah visa ", amount: 25_000 }, { label: "Ziyarat", amount: 5_000 }],
      } as never,
      { company },
    );
    expect(view.includes.map((l) => l.text)).toEqual(["Umrah visa", "Ziyarat", "Hotel accommodation"]);
  });

  it("prints a plain total when there is only one price", async () => {
    const view = await toUmrahPdfView(
      {
        ...quotation,
        guest: { name: "Ali", pax: 2 },
        priceLines: [{ key: "main", label: "Per Person", finalTotal: 99_000 }],
      } as never,
      { company },
    );
    expect(view.tierPrices).toEqual([]);
    expect(view.totalPrice).toBe("PKR 99,000 /-");
  });

  it("states when the ticket is not part of the package", async () => {
    const view = await toUmrahPdfView({ ...quotation, flight: { included: false } } as never, { company });
    expect(view.travel.included).toBe(false);
    expect(view.travel.note).toContain("not part of this package");
  });

  it("prints a foreign currency the way the quotation holds it", async () => {
    const view = await toUmrahPdfView(
      { ...quotation, currency: { code: "SAR", decimals: 2 }, priceLines: [{ key: "main", label: "Per Person", finalTotal: 1234.5 }] } as never,
      { company },
    );
    expect(view.totalPrice).toBe("SAR 1,234.50");
  });

  it("drops the letterhead when branding is off, keeping the signature", async () => {
    const html = buildHtml(await toUmrahPdfView(quotation as never, { company, branding: false }));
    expect(html).not.toContain("JUNAIDI</span>");
    expect(html).toContain("<span>Authorised Signature</span>");
  });

  it("names the file from the quotation and guest", () => {
    expect(umrahPdfFilename({ quotationId: "UQ-2026-0007", guest: { name: "Rashid / Shahid!" } })).toBe(
      "UQ-2026-0007_Rashid_Shahid.pdf",
    );
  });
});
