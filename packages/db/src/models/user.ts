/**
 * Staff and admin accounts.
 *
 * `passwordHash` is deliberately `select: false` so it never comes back from a
 * routine query and cannot be serialised into an API response by accident.
 */

import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

export const USER_ROLES = ["admin", "staff"] as const;
export type UserRole = (typeof USER_ROLES)[number];

const userSchema = new Schema(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    name: { type: String, required: true, trim: true },
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, required: true, enum: [...USER_ROLES], default: "staff" },
    active: { type: Boolean, default: true },
    lastLoginAt: { type: Date, default: null },
  },
  { timestamps: true },
);

export const UserModel: Model<InferSchemaType<typeof userSchema>> =
  (mongoose.models.User as Model<InferSchemaType<typeof userSchema>>) ??
  mongoose.model("User", userSchema);
