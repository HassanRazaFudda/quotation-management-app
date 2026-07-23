import { HIJRI_MONTHS } from "@junaidi/shared";
import { checkMonthsAreContiguous, importCalendarMonths } from "@junaidi/db";
import { z } from "zod";

import { requireAdmin } from "@/server/auth";
import { handleOptions, json, readJson, route } from "@/server/http";

export const runtime = "nodejs";

export const OPTIONS = handleOptions;

const monthSchema = z.object({
  hijriYear: z.number().int(),
  month: z.enum(HIJRI_MONTHS),
  startGregorian: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  length: z.number().int().min(28).max(30),
});

const importSchema = z.object({
  months: z.array(monthSchema).min(1),
  replaceYear: z.number().int().optional(),
  /** When true, only report problems without writing. */
  dryRun: z.boolean().default(false),
});

/**
 * Import a season's Hijri calendar. Reports any non-contiguous months (a
 * mistyped length would shift every later date) before writing.
 */
export const POST = route(async (request) => {
  await requireAdmin(request);
  const body = importSchema.parse(await readJson(request));

  if (body.dryRun) {
    return json(request, {
      dryRun: true,
      problems: checkMonthsAreContiguous(body.months),
    });
  }

  const result = await importCalendarMonths(body.months, { replaceYear: body.replaceYear });
  return json(request, result);
});
