/**
 * Just the room-size part of `seed()`, on its own.
 *
 * The RoomSize collection is brand new - a prod database that has never seen
 * it needs the base six (Sharing, Quad, Triple, Double, Quint, Hexa) created
 * before Room Sizes/Rates has anything to show. Running the full `seed()` for
 * this achieves the same result, but also touches locations, accommodations,
 * meals, blocks, services, rates and flights - all safe (matched by natural
 * key, real rates protected by `$setOnInsert`), but more than this one thing
 * needs. This script does only the room-size upserts, nothing else.
 *
 * Safe to re-run: each size is matched by (season, code), so re-running just
 * updates the same six rows in place rather than duplicating them.
 */

import { connect, disconnect } from "../connection";
import { RoomSizeModel } from "../models/config";
import { DEFAULT_SEASON, ROOM_SIZES } from "../seed";

export interface SeedRoomSizesResult {
  season: string;
  roomSizes: number;
}

export async function seedRoomSizes(season = DEFAULT_SEASON): Promise<SeedRoomSizesResult> {
  for (const [index, size] of ROOM_SIZES.entries()) {
    await RoomSizeModel.findOneAndUpdate(
      { season, code: size.code },
      { $set: { season, ...size, sortOrder: index, active: true } },
      { upsert: true, returnDocument: "after" },
    );
  }
  return { season, roomSizes: ROOM_SIZES.length };
}

// Run directly: pnpm --filter @junaidi/db seed:room-sizes
if (process.argv[1]?.includes("seed-room-sizes")) {
  await connect();
  const result = await seedRoomSizes();
  console.log("Seeded:", result);
  await disconnect();
}
