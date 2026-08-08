/**
 * Just the Mina-tier part of `seed()`, on its own.
 *
 * The MinaTier collection is brand new - a prod database that has never seen
 * it needs the base three (Standard, Premium, Deluxe) created before the
 * Mina Tiers admin screen has anything to show, and before the Hotel
 * Management "Mina option" dropdown (which now reads from this list instead
 * of a hardcoded one) has anything to offer. Running the full `seed()` for
 * this achieves the same result, but also touches locations, accommodations,
 * meals, blocks, services, rates and flights - all safe (matched by natural
 * key, real rates protected by `$setOnInsert`), but more than this one thing
 * needs. This script does only the Mina-tier upserts, nothing else.
 *
 * Safe to re-run: each tier is matched by (season, code), so re-running just
 * updates the same three rows in place rather than duplicating them.
 */

import { connect, disconnect } from "../connection";
import { MinaTierModel } from "../models/config";
import { DEFAULT_SEASON, MINA_TIER_SEED } from "../seed";

export interface SeedMinaTiersResult {
  season: string;
  minaTiers: number;
}

export async function seedMinaTiers(season = DEFAULT_SEASON): Promise<SeedMinaTiersResult> {
  for (const [index, tier] of MINA_TIER_SEED.entries()) {
    await MinaTierModel.findOneAndUpdate(
      { season, code: tier.code },
      { $set: { season, ...tier, sortOrder: index, active: true } },
      { upsert: true, returnDocument: "after" },
    );
  }
  return { season, minaTiers: MINA_TIER_SEED.length };
}

// Run directly: pnpm --filter @junaidi/db seed:mina-tiers
if (process.argv[1]?.endsWith("seed-mina-tiers.ts")) {
  await connect();
  const result = await seedMinaTiers();
  console.log("Seeded:", result);
  await disconnect();
}
