/**
 * Umrah settings: the letterhead printed on Umrah quotations and the default
 * Includes / Visa Requirements / Terms text new quotations start from.
 *
 * One document, edited by an admin, so a change of name, number or address
 * never needs a code change.
 */

import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

const lineSchema = new Schema(
  {
    text: { type: String, required: true },
    color: { type: String, default: "" },
    bold: { type: Boolean, default: false },
  },
  { _id: false },
);

const umrahSettingsSchema = new Schema(
  {
    /** Always "umrah" - the single settings document. */
    key: { type: String, required: true, unique: true },
    company: {
      name: { type: String, default: "", trim: true },
      subheading: { type: String, default: "", trim: true },
      tagline: { type: String, default: "", trim: true },
      address: { type: String, default: "", trim: true },
      contact: { type: String, default: "", trim: true },
      social: {
        facebook: { type: String, default: "", trim: true },
        instagram: { type: String, default: "", trim: true },
        youtube: { type: String, default: "", trim: true },
        whatsapp: { type: String, default: "", trim: true },
      },
    },
    defaults: {
      includes: { type: [lineSchema], default: [] },
      requirements: { type: [lineSchema], default: [] },
      terms: { type: [lineSchema], default: [] },
    },
    updatedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true },
);

export const UmrahSettingsModel: Model<InferSchemaType<typeof umrahSettingsSchema>> =
  (mongoose.models.UmrahSettings as Model<InferSchemaType<typeof umrahSettingsSchema>>) ??
  mongoose.model("UmrahSettings", umrahSettingsSchema);
