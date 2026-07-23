/**
 * Authentication.
 *
 * The frontend and the API live on different domains (Vercel and Render), so a
 * same-site session cookie is not an option. A signed JWT sent as
 * `Authorization: Bearer` is, and it keeps the API stateless.
 */

import { UserModel } from "@junaidi/db";
import bcrypt from "bcryptjs";
import { SignJWT, jwtVerify } from "jose";

export type Role = "admin" | "staff";

export interface Session {
  userId: string;
  email: string;
  name: string;
  role: Role;
}

const TOKEN_TTL = "12h";

export class AuthError extends Error {
  constructor(
    message: string,
    readonly status: 401 | 403 = 401,
  ) {
    super(message);
    this.name = "AuthError";
  }
}

function secret(): Uint8Array {
  const value = process.env.JWT_SECRET;
  if (!value || value.length < 32) {
    // Failing loudly beats silently signing with a guessable key.
    throw new Error(
      "JWT_SECRET is missing or shorter than 32 characters. Set it before starting the API.",
    );
  }
  return new TextEncoder().encode(value);
}

export async function issueToken(session: Session): Promise<string> {
  return new SignJWT({ email: session.email, name: session.name, role: session.role })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(session.userId)
    .setIssuedAt()
    .setExpirationTime(TOKEN_TTL)
    .sign(secret());
}

export async function verifyToken(token: string): Promise<Session> {
  try {
    const { payload } = await jwtVerify(token, secret());
    return {
      userId: String(payload.sub),
      email: String(payload.email ?? ""),
      name: String(payload.name ?? ""),
      role: (payload.role === "admin" ? "admin" : "staff") as Role,
    };
  } catch {
    throw new AuthError("Your session has expired. Please sign in again.");
  }
}

/** Verify an email/password pair. Returns null rather than saying which was wrong. */
export async function authenticate(
  email: string,
  password: string,
): Promise<Session | null> {
  // passwordHash is `select: false`, so it must be asked for explicitly.
  const user = await UserModel.findOne({
    email: email.toLowerCase().trim(),
    active: true,
  }).select("+passwordHash");

  if (!user) {
    // Hash anyway so a missing account takes as long as a wrong password.
    await bcrypt.compare(password, "$2b$12$invalidinvalidinvalidinvalidinvalidinvalidinv");
    return null;
  }

  if (!(await bcrypt.compare(password, user.passwordHash))) return null;

  await UserModel.updateOne({ _id: user._id }, { $set: { lastLoginAt: new Date() } });

  return {
    userId: String(user._id),
    email: user.email,
    name: user.name,
    role: user.role as Role,
  };
}

export async function hashPassword(password: string): Promise<string> {
  if (password.length < 8) {
    throw new AuthError("Password must be at least 8 characters.", 403);
  }
  return bcrypt.hash(password, 12);
}

// ---------------------------------------------------------------- guards

export async function sessionFrom(request: Request): Promise<Session> {
  const header = request.headers.get("authorization") ?? "";
  const [scheme, token] = header.split(" ");

  if (scheme?.toLowerCase() !== "bearer" || !token) {
    throw new AuthError("Sign in to continue.");
  }
  return verifyToken(token);
}

export async function requireAdmin(request: Request): Promise<Session> {
  const session = await sessionFrom(request);
  if (session.role !== "admin") {
    throw new AuthError("Only an administrator can do this.", 403);
  }
  return session;
}
