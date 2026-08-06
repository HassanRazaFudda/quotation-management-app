/**
 * One-time fix for packages saved with the stale "(Customize)" suffix.
 *
 * A saved package's own title should read "... Days Package" - that
 * "(Customize)" suffix belongs only on a quotation drawn from a package
 * (`PACKAGE_TITLE_SUFFIX`), never on the package template itself
 * (`PACKAGE_TEMPLATE_SUFFIX`). The builder has correctly used the plain
 * suffix for a while now, but a package saved before that distinction
 * existed still carries the wrong wording, and - since the title box is only
 * auto-rebuilt while `packageTitleEdited` is off - it never self-corrects.
 *
 * Safe to re-run: only a title still ending in " (Customize)" is touched.
 */

import { connect, disconnect } from "../connection";
import { PackageModel } from "../models/package";

export interface FixPackageTitlesResult {
  fixed: number;
}

const STALE_SUFFIX = " (Customize)";

export async function fixPackageTitles(): Promise<FixPackageTitlesResult> {
  const packages = await PackageModel.find({
    packageTitle: { $regex: /\(Customize\)\s*$/ },
  });

  let fixed = 0;
  for (const pkg of packages) {
    if (!pkg.packageTitle?.endsWith(STALE_SUFFIX)) continue;
    pkg.packageTitle = pkg.packageTitle.slice(0, -STALE_SUFFIX.length);
    await pkg.save();
    fixed += 1;
  }
  return { fixed };
}

// Run directly: pnpm --filter @junaidi/db fix:package-titles
if (process.argv[1]?.endsWith("fix-package-titles.ts")) {
  await connect();
  const result = await fixPackageTitles();
  console.log("Fixed:", result);
  await disconnect();
}
