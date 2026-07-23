/**
 * MongoDB connection.
 *
 * The connection is cached on `globalThis` rather than a module variable so it
 * survives hot reloads in development and repeated handler invocations if this
 * ever runs somewhere serverless. Opening a new pool per request is the classic
 * way to exhaust an Atlas free tier's connection limit.
 */

import mongoose from "mongoose";

const DEFAULT_URI = "mongodb://127.0.0.1:27017/junaidi";

interface ConnectionCache {
  connection: Promise<typeof mongoose> | null;
  uri: string | null;
}

const globalCache = globalThis as unknown as { __junaidiDb?: ConnectionCache };

const cache: ConnectionCache = (globalCache.__junaidiDb ??= {
  connection: null,
  uri: null,
});

export function mongoUri(): string {
  return process.env.MONGODB_URI ?? DEFAULT_URI;
}

export async function connect(uri: string = mongoUri()): Promise<typeof mongoose> {
  // A different URI (tests use their own database) means a fresh connection.
  if (cache.connection && cache.uri === uri) return cache.connection;
  if (cache.connection && cache.uri !== uri) await disconnect();

  cache.uri = uri;
  cache.connection = mongoose
    .connect(uri, {
      // Fail fast instead of hanging for 30s when Mongo is unreachable.
      serverSelectionTimeoutMS: 8_000,
      maxPoolSize: 10,
    })
    .catch((error) => {
      // Do not cache a failed attempt, or every later call inherits it.
      cache.connection = null;
      cache.uri = null;
      throw error;
    });

  return cache.connection;
}

export async function disconnect(): Promise<void> {
  if (!cache.connection) return;
  const pending = cache.connection;
  cache.connection = null;
  cache.uri = null;
  try {
    await pending;
    await mongoose.disconnect();
  } catch {
    // already down
  }
}

export function isConnected(): boolean {
  return mongoose.connection.readyState === 1;
}
