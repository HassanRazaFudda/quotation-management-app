/**
 * User administration.
 *
 * Passwords are hashed with bcrypt and never returned. Deactivation is
 * preferred over deletion so a departed staff member's quotations keep their
 * author.
 */

import bcrypt from "bcryptjs";

import { UserModel, type UserRole } from "../models/user";
import { AdminError } from "./admin";

export interface UserView {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  active: boolean;
  lastLoginAt: string | null;
  createdAt: string;
}

function toView(doc: Record<string, any>): UserView {
  return {
    id: String(doc._id),
    email: doc.email,
    name: doc.name,
    role: doc.role,
    active: doc.active,
    lastLoginAt: doc.lastLoginAt ? new Date(doc.lastLoginAt).toISOString() : null,
    createdAt: new Date(doc.createdAt).toISOString(),
  };
}

export async function listUsers(): Promise<UserView[]> {
  const docs = await UserModel.find().sort({ createdAt: 1 }).lean();
  return docs.map(toView);
}

export async function createUser(input: {
  email: string;
  name: string;
  password: string;
  role: UserRole;
}): Promise<UserView> {
  const email = input.email.toLowerCase().trim();

  if (input.password.length < 8) {
    throw new AdminError("Password must be at least 8 characters.");
  }
  if (await UserModel.exists({ email })) {
    throw new AdminError("A user with that email already exists.");
  }

  const doc = await UserModel.create({
    email,
    name: input.name.trim(),
    passwordHash: await bcrypt.hash(input.password, 12),
    role: input.role,
    active: true,
  });
  return toView(doc.toObject());
}

export async function updateUser(
  id: string,
  patch: { name?: string; role?: UserRole; active?: boolean; password?: string },
): Promise<UserView> {
  const update: Record<string, unknown> = {};
  if (patch.name !== undefined) update.name = patch.name.trim();
  if (patch.role !== undefined) update.role = patch.role;
  if (patch.active !== undefined) update.active = patch.active;
  if (patch.password) {
    if (patch.password.length < 8) {
      throw new AdminError("Password must be at least 8 characters.");
    }
    update.passwordHash = await bcrypt.hash(patch.password, 12);
  }

  const doc = await UserModel.findByIdAndUpdate(id, { $set: update }, { returnDocument: "after" }).lean();
  if (!doc) throw new AdminError("User not found.");
  return toView(doc);
}

/**
 * Guard against locking everyone out: the last active admin cannot be demoted
 * or deactivated.
 */
export async function assertNotLastAdmin(id: string, change: { role?: UserRole; active?: boolean }) {
  const losingAdmin = change.role === "staff" || change.active === false;
  if (!losingAdmin) return;

  const activeAdmins = await UserModel.countDocuments({ role: "admin", active: true });
  const target = await UserModel.findById(id).lean();
  if (target?.role === "admin" && target.active && activeAdmins <= 1) {
    throw new AdminError("This is the only administrator; it cannot be removed.");
  }
}
