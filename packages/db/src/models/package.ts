/**
 * A predefined package - a reusable quotation without the customer.
 *
 * It stores the builder's *input* (block, hotel and service references), not
 * the priced snapshots a quotation freezes. When staff start a quotation from a
 * package, the itinerary is re-priced against the live configuration, so a
 * package always reflects today's rates rather than the day it was created.
 *
 * Everything a quotation carries is here except the guest, the dates and the
 * money: those belong to the individual customer, not the template.
 */

import { AZIZIYA_ROOM_TYPES, OCCUPANCIES, SHARING_WORDS } from "@junaidi/shared";
import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

const packageStaySchema = new Schema(
  {
    blockId: { type: Schema.Types.ObjectId, ref: "DateBlock", required: true },
    locationId: { type: Schema.Types.ObjectId, ref: "Location", required: true },
    accommodationId: { type: Schema.Types.ObjectId, ref: "Accommodation", required: true },
    roomType: { type: String, enum: [...AZIZIYA_ROOM_TYPES, null], default: null },
    occupancy: { type: String, enum: [...OCCUPANCIES, null], default: null },
    sharingWord: { type: String, enum: [...SHARING_WORDS, null], default: null },
    mealId: { type: Schema.Types.ObjectId, ref: "Meal", default: null },
    mealNoteId: { type: Schema.Types.ObjectId, ref: "MealNote", default: null },
  },
  { _id: false },
);

const packageSchema = new Schema(
  {
    /** Shown in the "start from package" dropdown, so it must read on its own. */
    name: { type: String, required: true, trim: true },
    season: { type: String, required: true, trim: true },

    packageTitle: { type: String, default: "" },
    packageCategory: { type: String, default: "" },
    withoutMina: { type: Boolean, default: false },
    qurbaniIncluded: { type: Boolean, default: true },
    /** The Mina option chosen once at the top of the builder. */
    minaAccommodationId: { type: Schema.Types.ObjectId, ref: "Accommodation", default: null },

    stays: { type: [packageStaySchema], default: [] },

    flight: {
      included: { type: Boolean, default: false },
      returnRequired: { type: Boolean, default: true },
      roundTrip: { type: Boolean, default: false },
      outboundId: { type: Schema.Types.ObjectId, ref: "Flight", default: null },
      inboundId: { type: Schema.Types.ObjectId, ref: "Flight", default: null },
      roundTripId: { type: Schema.Types.ObjectId, ref: "Flight", default: null },
    },

    minaServiceIds: [{ type: Schema.Types.ObjectId, ref: "ServiceItem" }],
    arafatServiceIds: [{ type: Schema.Types.ObjectId, ref: "ServiceItem" }],
    includeIds: [{ type: Schema.Types.ObjectId, ref: "ServiceItem" }],
    requirementIds: [{ type: Schema.Types.ObjectId, ref: "ServiceItem" }],
    termIds: [{ type: Schema.Types.ObjectId, ref: "ServiceItem" }],
    includesNote: { type: String, default: "" },
    remarks: { type: String, default: "" },

    sortOrder: { type: Number, default: 0 },
    active: { type: Boolean, default: true },
  },
  { timestamps: true },
);

packageSchema.index({ season: 1, active: 1, sortOrder: 1 });

export const PackageModel: Model<InferSchemaType<typeof packageSchema>> =
  (mongoose.models.Package as Model<InferSchemaType<typeof packageSchema>>) ??
  mongoose.model("Package", packageSchema);
