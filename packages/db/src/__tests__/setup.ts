/**
 * Tests run against the real MongoDB on this machine, in a throwaway database
 * so nothing touches development or production data. The database is dropped
 * when the suite finishes.
 */

import mongoose from "mongoose";

import { connect, disconnect } from "../connection";

const BASE_URI = process.env.MONGODB_TEST_URI ?? "mongodb://127.0.0.1:27017";

export function testDbName(suite: string): string {
  return `junaidi_test_${suite}_${process.pid}`;
}

export async function connectTestDb(suite: string): Promise<void> {
  await connect(`${BASE_URI}/${testDbName(suite)}`);
}

export async function dropTestDb(): Promise<void> {
  if (mongoose.connection.readyState === 1) {
    await mongoose.connection.dropDatabase();
  }
  await disconnect();
}

/** Empty every collection between tests without paying to rebuild indexes. */
export async function clearCollections(): Promise<void> {
  const { collections } = mongoose.connection;
  await Promise.all(
    Object.values(collections).map((collection) => collection.deleteMany({})),
  );
}
