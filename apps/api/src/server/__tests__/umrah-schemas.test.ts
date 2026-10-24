import { describe, expect, it } from "vitest";

import { umrahQuotationSchema, umrahSettingsSchema, umrahStatusSchema } from "../umrah-schemas";

const stay = {
  city: "Makkah",
  hotelName: "Emaar Al Khalil",
  checkIn: "2026-12-12",
  checkOut: "2026-12-19",
  currencyCode: "sar",
  rooms: [{ roomType: "Quad", rooms: 1, persons: 4, rate: 300 }],
};

const base = {
  guest: { name: "  Rashid Shahid ", pax: 4 },
  date: "2026-11-20",
  pricingMode: "single",
  currency: { code: "pkr", decimals: 0 },
  stays: [stay],
};

describe("umrahQuotationSchema", () => {
  it("accepts a minimal quotation, tidying and defaulting it", () => {
    const parsed = umrahQuotationSchema.parse(base);
    expect(parsed.guest).toEqual({ name: "Rashid Shahid", pax: 4, withoutBedPax: 0, infants: 0 });
    expect(parsed.stays[0]!.currencyCode).toBe("SAR");
    expect(parsed.stays[0]!.rateBasis).toBe("room");
    expect(parsed.stays[0]!.tierRates).toEqual({ Quad: null, Triple: null, Double: null });
    expect(parsed.currency.code).toBe("PKR");
    expect(parsed.transportDisplay).toBe("included");
    expect(parsed.priceDisplay).toBe("average");
    expect(parsed.flight.included).toBe(false);
    expect(parsed.transportLegs).toEqual([]);
    expect(parsed.lineSettings).toEqual([]);
  });

  it("never accepts a price, total or night count from the client", () => {
    const parsed = umrahQuotationSchema.parse({
      ...base,
      grandTotal: 1,
      finalTotal: 1,
      priceLines: [{ key: "main", finalTotal: 1 }],
      stays: [{ ...stay, nights: 99, cost: 1 }],
    }) as Record<string, unknown>;
    expect(parsed.grandTotal).toBeUndefined();
    expect(parsed.finalTotal).toBeUndefined();
    expect(parsed.priceLines).toBeUndefined();
    expect((parsed.stays as Array<Record<string, unknown>>)[0]!.nights).toBeUndefined();
  });

  it("rejects negative, absurd or non-numeric money", () => {
    const withRate = (rate: unknown) => ({ ...base, stays: [{ ...stay, rooms: [{ roomType: "Quad", rooms: 1, persons: 4, rate }] }] });
    expect(() => umrahQuotationSchema.parse(withRate(-1))).toThrow();
    expect(() => umrahQuotationSchema.parse(withRate(1e12))).toThrow();
    expect(() => umrahQuotationSchema.parse(withRate("300"))).toThrow();
    expect(() => umrahQuotationSchema.parse(withRate(Number.NaN))).toThrow();
  });

  it("rejects a malformed currency code or an unknown mode", () => {
    expect(() => umrahQuotationSchema.parse({ ...base, stays: [{ ...stay, currencyCode: "SAUDI" }] })).toThrow();
    expect(() => umrahQuotationSchema.parse({ ...base, pricingMode: "cheap" })).toThrow();
  });

  it("needs a guest name", () => {
    expect(() => umrahQuotationSchema.parse({ ...base, guest: { name: "   ", pax: 2 } })).toThrow("Guest name is required.");
  });

  it("bounds how much one request can carry", () => {
    expect(() => umrahQuotationSchema.parse({ ...base, stays: Array.from({ length: 21 }, () => stay) })).toThrow();
    expect(() => umrahQuotationSchema.parse({ ...base, remarks: "x".repeat(2001) })).toThrow();
    expect(() => umrahQuotationSchema.parse({ ...base, guest: { name: "A", pax: 501 } })).toThrow();
    expect(() =>
      umrahQuotationSchema.parse({ ...base, transportLegs: Array.from({ length: 31 }, () => ({ route: "r", cost: 1, currencyCode: "PKR" })) }),
    ).toThrow();
  });

  it("accepts a typed price and a negative round-off on a line", () => {
    const parsed = umrahQuotationSchema.parse({
      ...base,
      lineSettings: [{ key: "main", discount: 500, roundOff: -250, manualTotal: 40_000 }, { key: "infant" }],
    });
    expect(parsed.lineSettings[0]).toMatchObject({ discount: 500, roundOff: -250, manualTotal: 40_000 });
    expect(parsed.lineSettings[1]).toMatchObject({ discount: 0, roundOff: 0, manualTotal: null });
    expect(() => umrahQuotationSchema.parse({ ...base, lineSettings: [{ key: "bogus" }] })).toThrow();
  });
});

describe("umrahStatusSchema", () => {
  it("accepts a status with a booking number", () => {
    expect(umrahStatusSchema.parse({ status: "confirmed", bookingRef: "UB-1" })).toMatchObject({ status: "confirmed" });
    expect(() => umrahStatusSchema.parse({ status: "approved" })).toThrow();
    expect(() => umrahStatusSchema.parse({ status: "confirmed", assignedStaffUserId: "nope" })).toThrow();
  });
});

describe("umrahSettingsSchema", () => {
  const settings = (company: Record<string, unknown> = {}) => ({
    company: {
      name: "Junaidi A Travel",
      address: "Karachi",
      contact: "Phone: 021-111",
      social: { facebook: "https://facebook.com/x", whatsapp: "+92 300 1234567" },
      ...company,
    },
    defaults: { terms: [{ text: "All above rates are subject to availability." }] },
  });

  it("accepts a normal letterhead", () => {
    const parsed = umrahSettingsSchema.parse(settings());
    expect(parsed.company.social.instagram).toBe("");
    expect(parsed.defaults.terms[0]).toEqual({ text: "All above rates are subject to availability.", color: "", bold: false });
  });

  it("only lets web links through into the letterhead's href", () => {
    const social = (facebook: string) => settings({ social: { facebook, whatsapp: "" } });
    expect(() => umrahSettingsSchema.parse(social("javascript:alert(1)"))).toThrow();
    expect(() => umrahSettingsSchema.parse(social('https://x.com/"onmouseover="x'))).toThrow();
    expect(() => umrahSettingsSchema.parse(social("https://x.com/<script>"))).toThrow();
    expect(umrahSettingsSchema.parse(social("")).company.social.facebook).toBe("");
  });

  it("only lets digits through as a WhatsApp number", () => {
    const wa = (whatsapp: string) => settings({ social: { whatsapp } });
    expect(() => umrahSettingsSchema.parse(wa("call me"))).toThrow();
    expect(() => umrahSettingsSchema.parse(wa('+92"><img>'))).toThrow();
    expect(umrahSettingsSchema.parse(wa("")).company.social.whatsapp).toBe("");
  });

  it("needs a company name and a real colour", () => {
    expect(() => umrahSettingsSchema.parse(settings({ name: "  " }))).toThrow();
    expect(() =>
      umrahSettingsSchema.parse({ ...settings(), defaults: { terms: [{ text: "x", color: "red;background:url(x)" }] } }),
    ).toThrow();
  });
});
