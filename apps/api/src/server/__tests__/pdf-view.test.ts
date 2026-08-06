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
   * The Hajj row names the Maktab category the customer recognises, with the
   * tent tier in brackets after it.
   */
  it("shows the Maktab category and tent tier on the Hajj row", async () => {
    const view = await toPdfView({
      ...quotationWithDiscount,
      packageCategory: "Maktab A Category",
    } as never);
    expect(view.stays[1]!.accommodation).toBe("Maktab A Category (Deluxe)");
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
        { ...quotationWithDiscount.stays[1]!, accommodationName: "Without Mina", minaTier: null, withoutMina: true },
      ],
    } as never);
    expect(view.stays[1]!.accommodation).toBe("Without Mina");
  });

  /** When the tier field is unset, it is read off the tent name. */
  it("reads the tier off the tent name when the tier field is unset", async () => {
    const view = await toPdfView({
      ...quotationWithDiscount,
      packageCategory: "Maktab B Category",
      stays: [
        quotationWithDiscount.stays[0]!,
        {
          ...quotationWithDiscount.stays[1]!,
          accommodationName: "Mina Standard B Category",
          minaTier: null,
          withoutMina: false,
        },
      ],
    } as never);
    expect(view.stays[1]!.accommodation).toBe("Maktab B Category (Standard)");
  });

  it("labels a hotel room mix with sizes and pax counts", async () => {
    const view = await toPdfView({
      ...quotationWithDiscount,
      stays: [
        {
          ...quotationWithDiscount.stays[0]!, // Aziziya Hotel
          rooms: [
            { roomType: "sharing", occupancy: "Quad", sharingWord: null, roomLabel: "Sharing", headcount: 1 },
            { roomType: "sharing", occupancy: "Quad", sharingWord: "Quad", roomLabel: "Quad", headcount: 4 },
          ],
        },
        quotationWithDiscount.stays[1]!,
      ],
    } as never);
    expect(view.stays[0]!.accommodation).toBe("Aziziya Hotel (Sharing [01] + Quad [04])");
  });

  /**
   * A Mina stay can be split across tiers, exactly like a room can be split
   * across sizes. The Hajj row then names the categories directly, joined with
   * " + " - and "Without Mina" is a category in its own right, never dropped.
   */
  describe("a Mina split across tiers", () => {
    const minaSplit = (
      rooms: Array<Record<string, unknown>>,
    ) => ({
      ...quotationWithDiscount,
      packageCategory: "Maktab A Category",
      stays: [
        quotationWithDiscount.stays[0]!,
        { ...quotationWithDiscount.stays[1]!, rooms },
      ],
    });

    it("names two tiers with a '+' and their pax counts, from the frozen labels", async () => {
      const view = await toPdfView(
        minaSplit([
          { accommodationName: "Mina Premium", minaTier: "premium", roomLabel: "Premium", headcount: 3 },
          { accommodationName: "Mina Standard", minaTier: "standard", roomLabel: "Standard", headcount: 1 },
        ]) as never,
      );
      expect(view.stays[1]!.accommodation).toBe("Premium [03] + Standard [01]");
    });

    it("keeps 'Without Mina' as a category, deriving labels when unfrozen", async () => {
      // No roomLabel here, so the label is derived from tier / withoutMina.
      const view = await toPdfView(
        minaSplit([
          { accommodationName: "Mina Standard", minaTier: "standard", withoutMina: false, headcount: 2 },
          { accommodationName: "Without Mina", minaTier: null, withoutMina: true, headcount: 3 },
        ]) as never,
      );
      expect(view.stays[1]!.accommodation).toBe("Standard [02] + Without Mina [03]");
    });
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

  /**
   * A stay that keeps the Aziziya room across the Hajj days. Its own row says
   * "Including Hajj Days" and the Hajj row nested under it carries the Maktab.
   */
  describe("a stay that spans the Hajj days", () => {
    const spanning = {
      ...quotationWithDiscount,
      packageCategory: "Maktab A Category",
      totalNights: 13,
      stays: [
        {
          blockLabelHijri: "04 Zilhaj - 17 Zilhaj",
          blockLabelGregorian: "10 May - 23 May 2027",
          blockStartGregorian: "2027-05-10",
          blockEndGregorian: "2027-05-23",
          locationName: "Aziziya",
          locationType: "aziziya",
          accommodationName: "Aziziya Executive Hotel",
          roomType: "sharing",
          meal: "Full Board",
          mealNote: "",
          nights: 13,
          coversHajj: true,
        },
        {
          blockLabelHijri: "08 Zilhaj - 12 Zilhaj",
          blockLabelGregorian: "14 May - 18 May 2027",
          blockStartGregorian: "2027-05-14",
          blockEndGregorian: "2027-05-18",
          locationName: "Mina",
          locationType: "mina",
          accommodationName: "Mina Standard",
          minaTier: "standard",
          bedsPerTent: 16,
          meal: "Full Board",
          mealNote: "Meal by Muallim",
          nights: 0,
        },
      ],
    };

    it("keeps the phase short and notes 'Including Hajj' on the nights line", async () => {
      const view = await toPdfView(spanning as never);
      expect(view.stays[0]!.phase).toBe("Aziziya Stay");
      expect(view.stays[0]!.nights).toBe("13 Nights · Including Hajj");
      expect(view.stays[1]!.phase).toBe("Hajj Days");
      expect(view.stays[1]!.nights).toBe(""); // nested days are not counted again
    });

    it("carries the hotel on the spanning row and the Maktab on the Hajj row", async () => {
      const view = await toPdfView(spanning as never);
      expect(view.stays[0]!.accommodation).toBe("Aziziya Executive Hotel (Sharing)");
      expect(view.stays[1]!.accommodation).toBe("Maktab A Category (Standard)");
    });

    /** The return date is the fortnight's end, not the nested Hajj row's end. */
    it("dates the return from the spanning stay, not the nested Hajj row", async () => {
      const view = await toPdfView(spanning as never);
      expect(view.travel.departureDate).toBe("10 May 2027");
      expect(view.travel.returnDate).toBe("23 May 2027");
    });
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

  describe("currency", () => {
    it("prints the final in the quotation's currency, to its decimals", async () => {
      const view = await toPdfView({
        ...quotationWithDiscount,
        finalTotal: 1374.96,
        currency: { code: "USD", symbol: "$", decimals: 2 },
      } as never);
      expect(view.totalPrice).toBe("USD 1,374.96");
    });

    it("keeps PKR's familiar form when no currency is set", async () => {
      const view = await toPdfView(quotationWithDiscount as never);
      expect(view.totalPrice).toBe("PKR 249,000 /-");
    });

    it("formats a package's tier prices and add-ons like the total, in PKR by default", async () => {
      const view = await toPdfView(quotationWithDiscount as never, {
        asPackage: true,
        tierPrices: [{ label: "Quad", total: 1_925.5 }],
        addOns: [{ label: "Aziziya Double Bed", amount: 200 }],
      });
      expect(view.tierPrices).toEqual([{ label: "Quad", priceFormatted: "PKR 1,926 /-" }]);
      expect(view.addOns).toEqual([{ label: "Aziziya Double Bed", amountFormatted: "+PKR 200 /-" }]);
    });

    it("formats a package's tier prices and add-ons in USD when the package is priced in USD", async () => {
      const view = await toPdfView(
        { ...quotationWithDiscount, currency: { code: "USD", symbol: "$", decimals: 2 } } as never,
        {
          asPackage: true,
          tierPrices: [{ label: "Quad", total: 1925.5 }],
          addOns: [{ label: "Aziziya Double Bed", amount: 200 }],
        },
      );
      expect(view.tierPrices).toEqual([{ label: "Quad", priceFormatted: "USD 1,925.50" }]);
      expect(view.addOns).toEqual([{ label: "Aziziya Double Bed", amountFormatted: "+USD 200.00" }]);
    });
  });

  describe("branding", () => {
    it("prints Junaidi's letterhead by default, but never the agency signature", async () => {
      const html = buildHtml(await toPdfView(quotationWithDiscount as never));
      expect(html).toContain("JUNAIDI GROUP");
      expect(html).toContain("contact@junaidigroup.com");
      // The signature always reads "Authorised Signature", even branded.
      expect(html).toContain("Authorised Signature");
      expect(html).not.toContain("For Junaidi Air Travels");
    });

    it("strips the letterhead and signature when branding is off", async () => {
      const html = buildHtml(await toPdfView(quotationWithDiscount as never, { branding: false }));
      // No letterhead: the company name, address and socials are all gone.
      expect(html).not.toContain("JUNAIDI GROUP");
      expect(html).not.toContain("contact@junaidigroup.com");
      expect(html).not.toContain("For Junaidi Air Travels");
      // A neutral signature replaces the agency's.
      expect(html).toContain("Authorised Signature");
      // The quotation content itself is untouched.
      expect(html).toContain("PKR 249,000 /-");
      expect(html).toContain("Rashid Shahid");
    });

    it("keeps the 'Powered by Digitli' footer even when unbranded", async () => {
      const html = buildHtml(await toPdfView(quotationWithDiscount as never, { branding: false }));
      // That mark belongs to the software house, not Junaidi.
      expect(html).toContain("Digitli");
    });
  });

  describe("the HB number", () => {
    it("is absent from a quotation that is not yet confirmed", async () => {
      const html = buildHtml(await toPdfView(quotationWithDiscount as never));
      expect(html).not.toContain("HB Number:");
    });

    it("prints on the document once the booking is confirmed", async () => {
      const html = buildHtml(
        await toPdfView({ ...quotationWithDiscount, hbNumber: "HB-1448-0042" } as never),
      );
      expect(html).toContain("HB Number:");
      expect(html).toContain("HB-1448-0042");
      expect(html).toContain("Confirmed");
    });
  });

  describe("styled service lines", () => {
    it("prints a line's colour and bold weight, and leaves plain lines alone", async () => {
      const html = buildHtml(
        await toPdfView({
          ...quotationWithDiscount,
          includes: [
            { text: "Important note.", color: "#dc2626", bold: true },
            { text: "Ordinary note." },
          ],
        } as never),
      );
      expect(html).toContain("color:#dc2626");
      expect(html).toContain("font-weight:700");
      expect(html).toContain("Important note.");
      // The plain line carries no inline style of its own.
      expect(html).toContain("<li>Ordinary note.</li>");
    });

    it("still accepts plain strings from older quotations", async () => {
      const view = await toPdfView({
        ...quotationWithDiscount,
        includes: ["Just text."],
      } as never);
      expect(view.includes[0]).toEqual({ text: "Just text.", color: "", bold: false });
    });

    it("ignores a colour that is not a valid hex value", async () => {
      const html = buildHtml(
        await toPdfView({
          ...quotationWithDiscount,
          terms: [{ text: "Bad colour.", color: "red" }],
        } as never),
      );
      expect(html).toContain("<li>Bad colour.</li>"); // no color: applied
    });
  });
});
