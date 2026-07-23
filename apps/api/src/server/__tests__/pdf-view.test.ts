/**
 * The last line of defence for the discount.
 *
 * `toPdfView` is the only bridge from a stored quotation to the renderer. Even
 * when handed a document carrying a discount, a discount note and a subtotal,
 * none of it may appear in the payload the PDF is built from.
 */

import { buildHtml } from "@junaidi/pdf";
import { describe, expect, it } from "vitest";

import { pdfFilename, toPdfView } from "../pdf-view";

const quotationWithDiscount = {
  quotationId: "HQ-1448-0007",
  date: "2027-01-20",
  validUntil: "2027-01-27",
  packageTitle: "Hajj 1448 Maktab A",
  guest: { name: "Rashid Shahid", pax: 2 },
  totalNights: 8,

  // Internal figures that must never surface.
  subtotal: 284000,
  discount: 35000,
  discountNote: "repeat customer, do not print",
  finalTotal: 249000,

  createdByName: "Bilal Ahmed",

  stays: [
    {
      blockLabelHijri: "04 Zilhaj - 07 Zilhaj",
      blockLabelGregorian: "10 May - 13 May 2027",
      blockStartGregorian: "2027-05-10",
      blockEndGregorian: "2027-05-13",
      locationName: "Aziziya",
      locationType: "aziziya",
      accommodationName: "Aziziya Hotel",
      roomType: "sharing",
      meal: "3 Time",
      mealNote: "Pakistani Meal",
      nights: 3,
    },
    {
      blockLabelHijri: "07 Zilhaj - 12 Zilhaj",
      blockLabelGregorian: "13 May - 18 May 2027",
      blockStartGregorian: "2027-05-13",
      blockEndGregorian: "2027-05-18",
      locationName: "Mina",
      locationType: "mina",
      accommodationName: "Mina Deluxe",
      minaTier: "deluxe",
      bedsPerTent: 8,
      meal: "3 Time",
      mealNote: "Meal by Muallim",
      nights: 5,
    },
  ],
  minaServices: ["Carpeted tents."],
  includes: ["Visa charges."],
  requirements: ["Passport."],
  terms: ["Non-refundable."],
  includesNote: "",
  remarks: "",
};

describe("toPdfView", () => {
  it("carries no field capable of holding the discount", async () => {
    const view = await toPdfView(quotationWithDiscount as never);
    const keys = Object.keys(view);
    expect(keys).not.toContain("discount");
    expect(keys).not.toContain("discountNote");
    expect(keys).not.toContain("subtotal");
  });

  it("passes only the final, already-discounted price", async () => {
    const view = await toPdfView(quotationWithDiscount as never);
    expect(view.totalPrice).toBe("PKR 249,000 /-");
  });

  it("produces HTML with no trace of the discount", async () => {
    const html = buildHtml(await toPdfView(quotationWithDiscount as never));
    expect(html).not.toContain("35000");
    expect(html).not.toContain("35,000");
    expect(html).not.toContain("284000");
    expect(html).not.toContain("284,000");
    expect(html.toLowerCase()).not.toContain("discount");
    expect(html).not.toContain("repeat customer");
    expect(html).toContain("PKR 249,000 /-");
  });

  it("labels each stay with its own room", async () => {
    const view = await toPdfView(quotationWithDiscount as never);
    expect(view.stays[0]!.accommodation).toBe("Aziziya Hotel (Sharing)");
  });

  /**
   * The Hajj row names the Maktab category, which is what the customer
   * recognises - not the internal tent tier.
   */
  it("shows the Maktab category on the Hajj row", async () => {
    const view = await toPdfView({
      ...quotationWithDiscount,
      packageCategory: "Maktab A Category",
    } as never);
    expect(view.stays[1]!.accommodation).toBe("Maktab A Category");
  });

  it("falls back to the tent name when no category is set", async () => {
    const view = await toPdfView(quotationWithDiscount as never);
    expect(view.stays[1]!.accommodation).toBe("Mina Deluxe");
  });

  /** No tent means no Maktab to name, whatever the package category says. */
  it("names the without-Mina option rather than the category", async () => {
    const view = await toPdfView({
      ...quotationWithDiscount,
      packageCategory: "Maktab A Category",
      stays: [
        quotationWithDiscount.stays[0]!,
        { ...quotationWithDiscount.stays[1]!, accommodationName: "Without Mina", minaTier: null },
      ],
    } as never);
    expect(view.stays[1]!.accommodation).toBe("Without Mina");
  });

  /**
   * The travel dates are the itinerary's own edges, so they are known even for
   * a land-only package; only the sectors depend on selling the ticket.
   */
  it("dates the journey from the first and last stay", async () => {
    const view = await toPdfView(quotationWithDiscount as never);
    expect(view.travel.departureDate).toBe("10 May 2027");
    expect(view.travel.returnDate).toBe("18 May 2027");
  });

  it("prints the flight sectors only when the package includes them", async () => {
    const without = await toPdfView(quotationWithDiscount as never);
    expect(without.travel.included).toBe(false);
    expect(without.travel.outbound).toBe("");
    expect(without.travel.inbound).toBe("");
    expect(without.travel.note).toContain("not part of this package");

    const withFlights = await toPdfView({
      ...quotationWithDiscount,
      flight: {
        included: true,
        returnRequired: true,
        outbound: { origin: "Karachi", destination: "Jeddah", airline: "PIA" },
        inbound: { origin: "Jeddah", destination: "Karachi", airline: "PIA" },
      },
    } as never);
    expect(withFlights.travel.included).toBe(true);
    // Route only — the airline is not printed on the customer's document.
    expect(withFlights.travel.outbound).toBe("Karachi - Jeddah");
    expect(withFlights.travel.inbound).toBe("Jeddah - Karachi");
    expect(withFlights.travel.note).toBe("");
  });

  it("says so when only a one-way ticket is sold", async () => {
    const view = await toPdfView({
      ...quotationWithDiscount,
      flight: {
        included: true,
        returnRequired: false,
        outbound: { origin: "Karachi", destination: "Jeddah", airline: "PIA" },
        inbound: null,
      },
    } as never);
    expect(view.travel.outbound).toBe("Karachi - Jeddah");
    expect(view.travel.inbound).toBe("");
    expect(view.travel.note).toContain("One-way ticket only");
  });

  it("names the staff member who produced it, for the page footer", async () => {
    const view = await toPdfView(quotationWithDiscount as never);
    expect(view.generatedBy).toBe("Bilal Ahmed");
    expect(buildHtml(view)).toContain("Generated by:");
  });

  it("formats the guest line with pax", async () => {
    const view = await toPdfView(quotationWithDiscount as never);
    expect(view.guestName).toBe("Rashid Shahid * 02 PAX");
  });

  it("builds a safe filename", () => {
    expect(pdfFilename(quotationWithDiscount as never)).toBe("HQ-1448-0007_Rashid_Shahid.pdf");
  });
});
