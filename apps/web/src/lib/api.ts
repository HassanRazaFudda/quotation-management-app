/**
 * Typed client for the backend API.
 *
 * The API lives on another origin (Render), so the auth token travels in the
 * Authorization header rather than a cookie. `ApiError` carries the status and
 * any per-field messages so callers can surface them without re-parsing.
 */

import { useAuthStore } from "@/stores/auth";

export const API_BASE =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") ?? "http://localhost:4000";

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }

  /** Field-level messages from a 422, when present. */
  get fieldErrors(): string[] {
    if (Array.isArray(this.details)) {
      return this.details.map((d) =>
        typeof d === "string" ? d : (d as { message?: string }).message ?? String(d),
      );
    }
    return [];
  }
}

interface RequestOptions {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
  /** Skip attaching the token (login). */
  anonymous?: boolean;
  signal?: AbortSignal;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = {};
  if (options.body !== undefined) headers["Content-Type"] = "application/json";

  if (!options.anonymous) {
    const token = useAuthStore.getState().token;
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      method: options.method ?? "GET",
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      signal: options.signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throw new ApiError("Cannot reach the server. Check your connection.", 0);
  }

  // A 401 means the session is gone; drop it so the UI redirects to login.
  if (response.status === 401 && !options.anonymous) {
    useAuthStore.getState().clear();
  }

  const isJson = response.headers.get("content-type")?.includes("application/json");
  const payload = isJson ? await response.json().catch(() => null) : null;

  if (!response.ok) {
    const message =
      (payload && (payload.error as string)) || `Request failed (${response.status}).`;
    throw new ApiError(message, response.status, payload?.details);
  }

  return payload as T;
}

/** GET a PDF as a blob (for preview and download). */
async function requestPdf(path: string, options: RequestOptions = {}): Promise<Blob> {
  const headers: Record<string, string> = {};
  if (options.body !== undefined) headers["Content-Type"] = "application/json";
  const token = useAuthStore.getState().token;
  if (token) headers.Authorization = `Bearer ${token}`;

  const response = await fetch(`${API_BASE}${path}`, {
    method: options.method ?? "POST",
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    signal: options.signal,
  });

  if (response.status === 401) useAuthStore.getState().clear();
  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    throw new ApiError(payload?.error ?? "Could not generate the PDF.", response.status);
  }
  return response.blob();
}

export const api = {
  get: <T>(path: string, signal?: AbortSignal) => request<T>(path, { signal }),
  post: <T>(path: string, body?: unknown, signal?: AbortSignal) =>
    request<T>(path, { method: "POST", body, signal }),
  patch: <T>(path: string, body?: unknown) => request<T>(path, { method: "PATCH", body }),
  del: <T>(path: string) => request<T>(path, { method: "DELETE" }),
  login: <T>(body: unknown) => request<T>("/api/auth/login", { method: "POST", body, anonymous: true }),
  pdf: requestPdf,
};
