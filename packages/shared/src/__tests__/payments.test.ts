import { describe, expect, it } from "vitest";

import { convertPayment, paymentSummary } from "../payments";

describe("convertPayment", () => {
  it("keeps a same-currency payment as-is (rate 1)", () => {
    expect(convertPayment(500, 1, 2)).toBe(500);
    expect(convertPayment(500, 1, 0)).toBe(500);
  });

  it("converts a foreign payment and rounds to the quotation's decimals", () => {
    // 200 SAR at 1 SAR = 1.34 USD -> 268.00 USD.
    expect(convertPayment(200, 1.34, 2)).toBe(268);
    // Rounds to cents.
    expect(convertPayment(100, 0.2667, 2)).toBe(26.67);
  });

  it("never converts a negative amount", () => {
    expect(convertPayment(-50, 1, 2)).toBe(0);
  });
});

describe("paymentSummary", () => {
  const base = { finalTotal: 1000, pax: 4, decimals: 2 };

  it("charges the grand total against the per-person price times pax", () => {
    const s = paymentSummary({ ...base, payments: [] });
    expect(s.costPerPerson).toBe(1000);
    expect(s.grandTotal).toBe(4000);
    expect(s.totalReceived).toBe(0);
    expect(s.outstanding).toBe(4000);
    expect(s.status).toBe("unpaid");
  });

  it("is partially paid while something is owed", () => {
    const s = paymentSummary({ ...base, payments: [{ convertedAmount: 1500 }, { convertedAmount: 500 }] });
    expect(s.totalReceived).toBe(2000);
    expect(s.outstanding).toBe(2000);
    expect(s.status).toBe("partial");
  });

  it("is paid once the grand total is met, and clamps outstanding at zero", () => {
    const s = paymentSummary({ ...base, payments: [{ convertedAmount: 4000 }] });
    expect(s.status).toBe("paid");
    expect(s.outstanding).toBe(0);
    expect(s.overpaid).toBe(0);
  });

  it("reports an overpayment without a negative balance", () => {
    const s = paymentSummary({ ...base, payments: [{ convertedAmount: 4200 }] });
    expect(s.status).toBe("paid");
    expect(s.outstanding).toBe(0);
    expect(s.overpaid).toBe(200);
  });

  it("treats a cent of float noise as fully paid", () => {
    const s = paymentSummary({
      ...base,
      payments: [{ convertedAmount: 1333.33 }, { convertedAmount: 1333.33 }, { convertedAmount: 1333.34 }],
    });
    expect(s.totalReceived).toBe(4000);
    expect(s.status).toBe("paid");
  });
});
