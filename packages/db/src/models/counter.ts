/**
 * Sequence counters for human-readable quotation numbers.
 *
 * `findOneAndUpdate` with `$inc` is atomic on a single document, so numbers
 * stay unique without needing a transaction - which matters because the local
 * development MongoDB is a standalone and cannot run them.
 */

import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

const counterSchema = new Schema({
  _id: { type: String, required: true }, // e.g. "quotation:1448"
  value: { type: Number, default: 0 },
});

export const CounterModel: Model<InferSchemaType<typeof counterSchema>> =
  (mongoose.models.Counter as Model<InferSchemaType<typeof counterSchema>>) ??
  mongoose.model("Counter", counterSchema);

export async function nextSequence(key: string): Promise<number> {
  const doc = await CounterModel.findOneAndUpdate(
    { _id: key },
    { $inc: { value: 1 } },
    { upsert: true, returnDocument: "after" },
  );
  return doc!.value;
}
