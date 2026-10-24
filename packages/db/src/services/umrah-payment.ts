/**
 * Payments against a confirmed Umrah booking.
 *
 * Validation and conversion are the Hajj payment service's own (`preparePayment`),
 * so a payment means exactly the same thing in both modules; only the collection
 * it is stored in differs. Each payment freezes its own exchange rate and the
 * amount it converts to in the quotation currency.
 */

import { Types } from "mongoose";

import { UmrahQuotationModel } from "../models/umrah-quotation";
import { preparePayment, type PaymentActor, type PaymentInput } from "./payment";
import { UmrahQuotationError } from "./umrah-quotation";

async function findQuotation(id: string) {
  const quotation: any = Types.ObjectId.isValid(id) ? await UmrahQuotationModel.findById(id) : null;
  if (!quotation) throw new UmrahQuotationError("Quotation not found.");
  return quotation;
}

export async function addUmrahPayment(quotationId: string, input: PaymentInput, actor: PaymentActor) {
  const quotation = await findQuotation(quotationId);
  if (quotation.status !== "confirmed") {
    throw new UmrahQuotationError("Payments can only be recorded on a confirmed booking.");
  }

  const fields = await preparePayment(quotation, input);
  quotation.payments.push({
    ...fields,
    recordedBy: Types.ObjectId.isValid(actor.userId) ? new Types.ObjectId(actor.userId) : null,
    recordedByName: actor.name,
  });
  await quotation.save();
  return quotation;
}

export async function updateUmrahPayment(
  quotationId: string,
  paymentId: string,
  input: PaymentInput,
  _actor: PaymentActor,
) {
  const quotation = await findQuotation(quotationId);
  const payment = quotation.payments.id(paymentId);
  if (!payment) throw new UmrahQuotationError("Payment not found.");

  Object.assign(payment, await preparePayment(quotation, input));
  await quotation.save();
  return quotation;
}

export async function deleteUmrahPayment(quotationId: string, paymentId: string) {
  const quotation = await findQuotation(quotationId);
  if (!quotation.payments.id(paymentId)) throw new UmrahQuotationError("Payment not found.");
  quotation.payments.pull(paymentId);
  await quotation.save();
  return quotation;
}
