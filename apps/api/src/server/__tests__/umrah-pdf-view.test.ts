/**
 * The Umrah bridge to the PDF must hold the same line the Hajj one does: no
 * discount, subtotal or round-off can reach the page, whatever the stored
 * document carries.
 */

import { buildUmrahHtml } from "@junaidi/pdf";
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

const render = async (overrides: Record<string, unknown> = {}, branding?: boolean) =>
  buildUmrahHtml(await toUmrahPdfView({ ...quotation, ...overrides } as never, { company, branding }));

describe("toUmrahPdfView", () => {
  it("carries no field capable of holding the discount", async () => {
    const view = await toUmrahPdfView(quotation as never, { company });
    const keys = Object.keys(view);
    for (const forbidden of ["discount", "discountNote", "subtotal", "roundOff", "lineSettings", "priceLines"]) {
      expect(keys).not.toContain(forbidden);
    }
  });

  it("produces HTML with no trace of the discount, subtotal or round-off", async () => {
    const html = await render();
    for (const hidden of ["63000", "63,000", "291000", "291,000", "321", "repeat customer"]) {
      expect(html).not.toContain(hidden);
    }
    expect(html.toLowerCase()).not.toContain("discount");
    expect(html).toContain("PKR 228,000 /-");
  });

  it("keeps the signature line exactly as it always reads", async () => {
    const html = await render();
    expect(html).toContain("<span>Authorised Signature</span>");
    expect(html).toContain("<span>Guest Signature</span>");
  });

  it("is the Umrah document, with the letterhead from the settings", async () => {
    const html = await render({ bookingRef: "UB-12" });
    expect(html).toContain("Umrah Quotation");
    expect(html).toContain("<dt>Booking No.</dt>");
    expect(html).toContain("UB-12");
    expect(html).toContain('<span class="brand-red">JUNAIDI</span> A TRAVEL');
    expect(html).toContain("https://wa.me/923001234567");
    for (const hajj of ["HB Number", "Maktab", "Qurbani", "Mina", "Arafat"]) expect(html).not.toContain(hajj);
  });

  it("describes the party, the dates and the journey", async () => {
    const view = await toUmrahPdfView(quotation as never, { company });
    expect(view.guestName).toBe("Rashid Shahid");
    expect(view.party).toBe("4 Guests · 1 Infant · 1 without a bed");
    expect(view.totalDays).toBe("10"); // 9 nights
    expect(view.ticketIncluded).toBe(true);
    expect(view.departure).toEqual({ title: "Departure", detail: "10 December 2026", sub: "KHI - MED (Emirates)" });
    expect(view.stops.map((stop) => [stop.title, stop.detail])).toEqual([
      ["Madinah", "02 nights"],
      ["Makkah", "07 nights"],
    ]);
    expect(view.arrival).toEqual({ title: "Return", detail: "19 December 2026", sub: "JED - KHI (Emirates)" });
    expect(view.travelNote).toBe("");
  });

  it("counts adults and children apart when there are children", async () => {
    const view = await toUmrahPdfView(
      { ...quotation, guest: { name: "Ali", pax: 3, withoutBedPax: 1, infants: 1, children: 2, withoutBedChildren: 1 } } as never,
      { company },
    );
    expect(view.party).toBe("2 Adults · 2 Children · 1 Infant · 1 without a bed");
  });

  it("names each hotel's rooms, distance and without-bed guests", async () => {
    const view = await toUmrahPdfView(quotation as never, { company });
    expect(view.hotels[0]).toMatchObject({
      city: "Madinah",
      hotel: "Safwat Al Madinah",
      rooms: "1x Quad + 1x Double + 01 Without Bed",
      distance: "200 mtrs",
      nights: "02",
      meal: "Breakfast",
    });
    // A per-person rate names the room with how many it holds.
    expect(view.hotels[1]!.rooms).toBe("Suite [03] + 01 Without Bed");
  });

  it("lists transport without prices when it is inside the package price", async () => {
    const view = await toUmrahPdfView(quotation as never, { company });
    expect(view.transport).toEqual([
      { route: "Madinah to Makkah", vehicle: "Private Staria" },
      { route: "Makkah to Jeddah Airport", vehicle: "" },
    ]);
    expect(view.addOns).toEqual([]);
    const html = await render();
    expect(html).not.toContain("117,000");
    expect(html).not.toContain("142,000");
  });

  it("shows transport as its own charge when the agent chose that", async () => {
    const view = await toUmrahPdfView({ ...quotation, transportDisplay: "separate" } as never, { company });
    expect(view.addOns).toEqual([{ label: "transportation charges", price: "PKR 142,000 /-" }]);
  });

  it("lists each price, and extra charges by name only", async () => {
    const view = await toUmrahPdfView(quotation as never, { company });
    expect(view.prices).toEqual({
      kind: "list",
      caption: "Package price per person",
      rows: [
        { label: "Per Person (With Bed)", price: "PKR 228,000 /-" },
        { label: "Per Person (Without Bed)", price: "PKR 150,000 /-" },
        { label: "Per Infant", price: "PKR 38,000 /-" },
      ],
    });
    expect(view.includes.map((l) => l.text)).toEqual(["Umrah visa", "Ziyarat", "Hotel accommodation"]);
    expect(await render()).not.toContain("25,000");
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

  it("prints one figure when there is only one price", async () => {
    const view = await toUmrahPdfView(
      { ...quotation, guest: { name: "Ali", pax: 2 }, priceLines: [{ key: "main", label: "Per Person", finalTotal: 99_000 }] } as never,
      { company },
    );
    expect(view.prices).toEqual({ kind: "single", caption: "Package price per person", price: "PKR 99,000 /-" });
  });

  it("prints room types as a table with an Adult and a Child price", async () => {
    const priceLines = [
      { key: "Quad", label: "Quad · Adult", finalTotal: 115_000 },
      { key: "Quad:child", label: "Quad · Child", finalTotal: 95_000 },
      { key: "Double", label: "Double · Adult", finalTotal: 140_000 },
      { key: "infant", label: "Infant", finalTotal: 38_000 },
    ];
    const view = await toUmrahPdfView({ ...quotation, priceLines } as never, { company });
    expect(view.prices).toEqual({
      kind: "matrix",
      caption: "Package price per person",
      columns: ["Adult", "Child"],
      rows: [
        { label: "Quad", cells: ["PKR 115,000 /-", "PKR 95,000 /-"] },
        { label: "Double", cells: ["PKR 140,000 /-", ""] },
      ],
      extras: [{ label: "Infant", price: "PKR 38,000 /-" }],
    });
    const html = buildUmrahHtml(view);
    for (const figure of ["PKR 115,000 /-", "PKR 95,000 /-", "PKR 140,000 /-", "PKR 38,000 /-"]) {
      expect(html).toContain(figure);
    }
  });

  it("states when the ticket is not part of the package", async () => {
    const view = await toUmrahPdfView({ ...quotation, flight: { included: false } } as never, { company });
    expect(view.ticketIncluded).toBe(false);
    expect(view.flight).toBeNull();
    expect(view.travelNote).toContain("not part of this package");
  });

  it("prints a foreign currency the way the quotation holds it", async () => {
    const view = await toUmrahPdfView(
      { ...quotation, currency: { code: "SAR", decimals: 2 }, priceLines: [{ key: "main", label: "Per Person", finalTotal: 1234.5 }] } as never,
      { company },
    );
    expect(view.prices).toMatchObject({ kind: "single", price: "SAR 1,234.50" });
  });

  it("drops the letterhead when branding is off, keeping the signature", async () => {
    const html = await render({}, false);
    expect(html).not.toContain('<span class="brand-red">');
    expect(html).not.toContain("wa.me");
    expect(html).toContain("Umrah Quotation");
    expect(html).toContain("<span>Authorised Signature</span>");
  });

  it("names the file from the quotation and guest", () => {
    expect(umrahPdfFilename({ quotationId: "UQ-2026-0007", guest: { name: "Rashid / Shahid!" } })).toBe(
      "UQ-2026-0007_Rashid_Shahid.pdf",
    );
  });
});
