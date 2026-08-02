/**
 * Payments taken against a confirmed quotation.
 *
 * A quotation's price is per person and in its own currency; a booking is paid
 * for as a whole, in instalments. Each payment freezes its own exchange rate
 * and the amount it converts to in the quotation currency, so the money already
 * received never shifts when a rate later changes - the same freezing principle
 * the quotation itself uses.
 */

export type PaymentStatus = "unpaid" | "partial" | "paid";

/** One recorded payment, in the quotation currency once converted. */
export interface Payment {
  id: string;
  /** ISO date the payment was received, e.g. "2027-03-01". */
  date: string;
  /** The amount as received, in `paymentCurrency`. */
  amount: number;
  /** The currency the payment was taken in; usually the quotation's own. */
  paymentCurrency: string;
  /** Quotation-currency units per one payment-currency unit; 1 when the same. */
  exchangeRate: number;
  /** `amount x exchangeRate`, frozen, in the quotation currency. */
  convertedAmount: number;
  method: string;
  notes: string;
  /** The sales staff who took it: a system user, or a free-typed name. */
  receivedByUserId: string | null;
  receivedByName: string;
  /** Who entered the record, for audit. */
  recordedByName: string;
  createdAt: string;
}

export interface PaymentSummary {
  pax: number;
  /** The quotation's per-person price. */
  costPerPerson: number;
  /** The whole booking: `costPerPerson x pax`. Payments count against this. */
  grandTotal: number;
  totalReceived: number;
  outstanding: number;
  /** Anything received beyond the grand total. */
  overpaid: number;
  status: PaymentStatus;
}

/** Round to a currency's precision - whole units for PKR, cents for a foreign one. */
function roundTo(value: number, decimals: number): number {
  const factor = 10 ** Math.max(0, Math.round(decimals));
  return Math.round(value * factor) / factor;
}

/**
 * A payment's value in the quotation currency, frozen at entry: the received
 * amount times the rate, rounded to the quotation's decimals. `exchangeRate` is
 * quotation-units per one payment-unit, so it is 1 when the currencies match.
 */
export function convertPayment(amount: number, exchangeRate: number, decimals: number): number {
  const rate = Number.isFinite(exchangeRate) && exchangeRate > 0 ? exchangeRate : 1;
  return roundTo(Math.max(0, amount) * rate, decimals);
}

/**
 * The financial picture for a confirmed quotation: the grand total for the
 * whole party, what has come in, what is left, and where that leaves the status.
 */
export function paymentSummary(input: {
  /** Per-person price, in the quotation currency. */
  finalTotal: number;
  pax: number;
  /** The quotation currency's decimals. */
  decimals: number;
  payments: Array<{ convertedAmount: number }>;
}): PaymentSummary {
  const decimals = Math.max(0, Math.round(input.decimals));
  const pax = Math.max(1, Math.round(input.pax));
  const costPerPerson = input.finalTotal;
  const grandTotal = roundTo(costPerPerson * pax, decimals);
  const totalReceived = roundTo(
    input.payments.reduce((sum, p) => sum + (Number.isFinite(p.convertedAmount) ? p.convertedAmount : 0), 0),
    decimals,
  );
  const outstanding = Math.max(0, roundTo(grandTotal - totalReceived, decimals));
  const overpaid = Math.max(0, roundTo(totalReceived - grandTotal, decimals));
  // Half the smallest unit absorbs float noise when deciding "fully paid".
  const epsilon = decimals > 0 ? 0.5 / 10 ** decimals : 0.5;
  const status: PaymentStatus =
    totalReceived <= 0 ? "unpaid" : totalReceived + epsilon >= grandTotal ? "paid" : "partial";
  return { pax, costPerPerson, grandTotal, totalReceived, outstanding, overpaid, status };
}
