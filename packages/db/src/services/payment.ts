/**
 * Payments against a confirmed quotation.
 *
 * A quotation prices per person in its own currency; a booking is paid off as a
 * whole, in instalments. Each payment freezes the rate it was taken at and the
 * amount it converts to in the quotation currency, so money already received is
 * never re-valued when a rate later changes.
 */

import { convertPayment } from "@junaidi/shared";
import { Types } from "mongoose";

import { QuotationModel } from "../models/quotation";
import { UserModel } from "../models/user";
import { QuotationError } from "./quotation";

export interface PaymentInput {
  date: string | Date;
  amount: number;
  paymentCurrency?: string;
  /** Quotation-currency units per one payment-currency unit; 1 when the same. */
  exchangeRate?: number;
  method?: string;
  notes?: string;
  receivedByUserId?: string | null;
  receivedByName?: string;
}

/** Who is entering the record. */
export interface PaymentActor {
  userId: string;
  name: string;
}

function quotationDecimals(quotation: { currency?: { decimals?: number } | null }): number {
  return quotation.currency?.decimals ?? 0;
}

/** Resolve the receiver: a picked system user (name snapshotted) or a typed name. */
async function resolveReceiver(input: PaymentInput): Promise<{ userId: Types.ObjectId | null; name: string }> {
  if (input.receivedByUserId && Types.ObjectId.isValid(input.receivedByUserId)) {
    const user = await UserModel.findById(input.receivedByUserId).select("name").lean();
    if (user) return { userId: new Types.ObjectId(input.receivedByUserId), name: (user as Record<string, any>).name };
  }
  return { userId: null, name: (input.receivedByName ?? "").trim() };
}

/** Shared validation and conversion for a new or edited payment. */
async function prepared(quotation: any, input: PaymentInput) {
  const amount = Math.max(0, input.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new QuotationError("The amount received must be greater than zero.");
  }
  const receiver = await resolveReceiver(input);
  if (!receiver.name) throw new QuotationError("Choose or name who received the payment.");

  const exchangeRate = input.exchangeRate && input.exchangeRate > 0 ? input.exchangeRate : 1;
  const decimals = quotationDecimals(quotation);
  return {
    date: new Date(input.date),
    amount,
    paymentCurrency: (input.paymentCurrency ?? quotation.currency?.code ?? "PKR").toUpperCase(),
    exchangeRate,
    convertedAmount: convertPayment(amount, exchangeRate, decimals),
    method: (input.method ?? "").trim(),
    notes: input.notes ?? "",
    receivedByUserId: receiver.userId,
    receivedByName: receiver.name,
  };
}

export async function addPayment(quotationId: string, input: PaymentInput, actor: PaymentActor) {
  const quotation: any = await QuotationModel.findById(quotationId);
  if (!quotation) throw new QuotationError("Quotation not found.");
  if (quotation.status !== "confirmed") {
    throw new QuotationError("Payments can only be recorded on a confirmed booking.");
  }

  const fields = await prepared(quotation, input);
  quotation.payments.push({
    ...fields,
    recordedBy: Types.ObjectId.isValid(actor.userId) ? new Types.ObjectId(actor.userId) : null,
    recordedByName: actor.name,
  });
  await quotation.save();
  return quotation;
}

export async function updatePayment(
  quotationId: string,
  paymentId: string,
  input: PaymentInput,
  _actor: PaymentActor,
) {
  const quotation: any = await QuotationModel.findById(quotationId);
  if (!quotation) throw new QuotationError("Quotation not found.");
  const payment = quotation.payments.id(paymentId);
  if (!payment) throw new QuotationError("Payment not found.");

  Object.assign(payment, await prepared(quotation, input));
  await quotation.save();
  return quotation;
}

export async function deletePayment(quotationId: string, paymentId: string) {
  const quotation: any = await QuotationModel.findById(quotationId);
  if (!quotation) throw new QuotationError("Quotation not found.");
  if (!quotation.payments.id(paymentId)) throw new QuotationError("Payment not found.");
  quotation.payments.pull(paymentId);
  await quotation.save();
  return quotation;
}
