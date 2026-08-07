/**
 * Backfill for packages saved before an add-on could be tied to a tier.
 *
 * "Aziziya Triple Bed (per pax)" and "Aziziya Double Bed (per pax)" are the
 * two default add-on rows every package starts with (`DEFAULT_PACKAGE_ADDONS`
 * in the web app) - a Triple-priced and a Double-priced Aziziya room upgrade
 * over the Sharing rate. Since `appliesToTier` was added, a *new* package tags
 * them Triple/Double automatically, so checking one only prices into its own
 * tier and the print modal shows them as one combined "Separate Sharing"
 * checkbox. A package saved before that still has the untagged pair: two
 * separate checkboxes, and checking either folds its amount into all three
 * tiers - not what either was ever meant to do.
 *
 * This tags any add-on still carrying exactly one of those two labels, by
 * exact match only - a custom add-on that happens to mention "Triple" or
 * "Double" for an unrelated reason is left alone.
 *
 * Safe to re-run: an add-on that already has `appliesToTier` set is skipped.
 */

import { connect, disconnect } from "../connection";
import { PackageModel } from "../models/package";

const TAGS: Record<string, "Triple" | "Double"> = {
  "Aziziya Triple Bed (per pax)": "Triple",
  "Aziziya Double Bed (per pax)": "Double",
};

export interface TagAziziyaAddOnsResult {
  packagesUpdated: number;
}

export async function tagAziziyaAddOns(): Promise<TagAziziyaAddOnsResult> {
  const packages = await PackageModel.find({
    "addOns.label": { $in: Object.keys(TAGS) },
    "addOns.appliesToTier": { $exists: false },
  }).lean();

  let packagesUpdated = 0;
  for (const pkg of packages) {
    let changed = false;
    const addOns = (pkg.addOns as unknown as Array<Record<string, unknown>>).map((addOn) => {
      const tier = TAGS[(addOn.label as string) ?? ""];
      if (!tier || addOn.appliesToTier) return addOn;
      changed = true;
      return { ...addOn, appliesToTier: tier };
    });
    if (changed) {
      await PackageModel.updateOne({ _id: pkg._id }, { $set: { addOns } });
      packagesUpdated += 1;
    }
  }
  return { packagesUpdated };
}

// Run directly: pnpm --filter @junaidi/db tag:aziziya-addons
if (process.argv[1]?.endsWith("tag-aziziya-addons.ts")) {
  await connect();
  const result = await tagAziziyaAddOns();
  console.log("Tagged:", result);
  await disconnect();
}
