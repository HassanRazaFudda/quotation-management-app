import { describe, expect, it } from "vitest";

import { buildUmrahHtml } from "../umrah-template";
import { buildUmrahPdfView, type UmrahPdfViewInput } from "../umrah-view";

const input: UmrahPdfViewInput = {
  quotationId: "UQ-2026-0042",
  date: "12 November 2026",
  validUntil: "19 November 2026",
  guestName: "Rashid Shahid",
  party: "3 Adults · 2 Children · 1 Infant",
  packageTitle: "Umrah Package - 14 Nights",
  totalDays: "15",
  travelDates: "08 January - 22 January 2027",
  ticketIncluded: true,
  departure: { title: "Departure", detail: "08 January 2027", sub: "KHI - MED (Saudia)" },
  stops: [
    { title: "Madinah", detail: "05 nights", sub: "08 January - 13 January 2027" },
    { title: "Makkah", detail: "09 nights", sub: "13 January - 22 January 2027" },
  ],
  arrival: { title: "Return", detail: "22 January 2027", sub: "JED - KHI (Saudia)" },
  travelNote: "",
  hotels: [
    {
      city: "Makkah",
      hotel: "Swissotel Al Maqam",
      rooms: "1x Quad",
      distance: "100 mtrs",
      dates: "13 January - 22 January 2027",
      nights: "09",
      meal: "Breakfast",
    },
  ],
  flight: { airline: "Saudia", outbound: "KHI - MED", inbound: "" },
  transport: [{ route: "Madinah to Makkah", vehicle: "GMC" }],
  prices: {
    kind: "matrix",
    caption: "Package price per person",
    columns: ["Adult", "Child"],
    rows: [
      { label: "Quad", cells: ["PKR 455,000 /-", "PKR 389,000 /-"] },
      { label: "Double", cells: ["PKR 575,000 /-", ""] },
    ],
    extras: [{ label: "Infant", price: "PKR 95,000 /-" }],
  },
  addOns: [],
  terms: ["Rates are subject to availability."],
  branding: true,
  company: {
    name: "JUNAIDI GROUP",
    subheading: "",
    tagline: "",
    address: "Mona Square, Karachi",
    contact: "021-111",
    social: { facebook: "", instagram: "", youtube: "", whatsapp: "+92 323 427101" },
  },
};

describe("the Umrah document", () => {
  const html = buildUmrahHtml(buildUmrahPdfView(input));

  it("is titled as an Umrah quotation, with the letterhead", () => {
    expect(html).toContain("Umrah Quotation");
    // the first word of the name prints in Junaidi red
    expect(html).toContain('<span class="brand-red">JUNAIDI</span> GROUP');
    expect(html).toContain("Mona Square, Karachi");
    expect(html).toContain("https://wa.me/92323427101");
  });

  it("prints every price in the table, and a dash where there is none", () => {
    for (const figure of ["PKR 455,000 /-", "PKR 389,000 /-", "PKR 575,000 /-", "PKR 95,000 /-"]) {
      expect(html).toContain(figure);
    }
    expect(html).toContain('<span class="p-none">—</span>');
  });

  it("walks the journey from departure through each city to the return", () => {
    const order = ["Departure", "Madinah", "Makkah", "Return"].map((title) => html.indexOf(`stop-title">${title}`));
    expect(order.every((at) => at > 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(html).toContain("Air ticket included");
    // No return sector: the flight block says so.
    expect(html).toContain("One way");
  });

  it("signs off as it always has, and says nothing of a discount", () => {
    expect(html).toContain("<span>Authorised Signature</span>");
    expect(html).toContain("<span>Guest Signature</span>");
    expect(html.toLowerCase()).not.toContain("discount");
  });

  it("drops the letterhead for an unbranded copy", () => {
    const plain = buildUmrahHtml(buildUmrahPdfView({ ...input, branding: false }));
    expect(plain).not.toContain('<span class="brand-red">');
    expect(plain).not.toContain("wa.me");
    expect(plain).toContain("Umrah Quotation");
    expect(plain).toContain("<span>Authorised Signature</span>");
  });

  it("escapes what staff type", () => {
    const typed = buildUmrahHtml(buildUmrahPdfView({ ...input, guestName: "<b>Ali</b>", remarks: "a < b" }));
    expect(typed).toContain("&lt;b&gt;Ali&lt;/b&gt;");
    expect(typed).toContain("a &lt; b");
  });
});
