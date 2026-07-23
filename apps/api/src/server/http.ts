/**
 * Shared plumbing for the route handlers: CORS, JSON responses, and one place
 * where errors are turned into a status code.
 *
 * The frontend is on another origin, so every response needs CORS headers and
 * every route needs to answer the preflight OPTIONS request.
 */

import { AdminError, QuotationError, connect } from "@junaidi/db";
import { PricingError } from "@junaidi/shared";
import { ZodError } from "zod";

import { AuthError } from "./auth";

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status = 400,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export const notFound = (what: string) => new ApiError(`${what} not found.`, 404);

// ------------------------------------------------------------------- CORS

function allowedOrigins(): string[] {
  return (process.env.ALLOWED_ORIGINS ?? "http://localhost:3000")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}

export function corsHeaders(request: Request): Record<string, string> {
  const origin = request.headers.get("origin") ?? "";
  const allowed = allowedOrigins();

  // Echo the origin only when it is on the list; never reflect blindly.
  const allowOrigin = allowed.includes(origin) ? origin : (allowed[0] ?? "");

  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": "GET,POST,PATCH,DELETE,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

export function handleOptions(request: Request): Response {
  return new Response(null, { status: 204, headers: corsHeaders(request) });
}

// -------------------------------------------------------------- responses

export function json(
  request: Request,
  data: unknown,
  status = 200,
): Response {
  return Response.json(data, { status, headers: corsHeaders(request) });
}

export function pdfResponse(
  request: Request,
  bytes: Uint8Array,
  filename: string,
): Response {
  return new Response(bytes as BodyInit, {
    status: 200,
    headers: {
      ...corsHeaders(request),
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Length": String(bytes.byteLength),
    },
  });
}

// ----------------------------------------------------------------- errors

interface ErrorBody {
  error: string;
  details?: unknown;
}

function toErrorBody(error: unknown): { status: number; body: ErrorBody } {
  if (error instanceof AuthError) {
    return { status: error.status, body: { error: error.message } };
  }
  if (error instanceof ApiError) {
    return { status: error.status, body: { error: error.message, details: error.details } };
  }
  if (error instanceof ZodError) {
    return {
      status: 422,
      body: {
        error: "Some fields need attention.",
        details: error.issues.map((issue) => ({
          field: issue.path.join("."),
          message: issue.message,
        })),
      },
    };
  }
  if (error instanceof AdminError) {
    return { status: 400, body: { error: error.message } };
  }
  if (error instanceof QuotationError) {
    // The itinerary failed validation; hand back the specific problems so the
    // builder can point at the offending rows.
    return { status: 422, body: { error: error.message, details: error.issues } };
  }
  if (error instanceof PricingError) {
    // Almost always missing configuration rather than a bad request.
    return { status: 409, body: { error: error.message, details: { code: error.code } } };
  }

  console.error("Unhandled API error:", error);
  return { status: 500, body: { error: "Something went wrong. Please try again." } };
}

/**
 * Wrap a route handler so it always connects to Mongo first, always emits CORS
 * headers, and never leaks a stack trace to the client.
 */
export function route(
  handler: (request: Request, context: { params: Promise<Record<string, string>> }) => Promise<Response>,
) {
  return async (
    request: Request,
    context: { params: Promise<Record<string, string>> },
  ): Promise<Response> => {
    try {
      await connect();
      return await handler(request, context);
    } catch (error) {
      const { status, body } = toErrorBody(error);
      return Response.json(body, { status, headers: corsHeaders(request) });
    }
  };
}

// -------------------------------------------------------------- utilities

export async function readJson<T>(request: Request): Promise<T> {
  try {
    return (await request.json()) as T;
  } catch {
    throw new ApiError("Expected a JSON body.");
  }
}
