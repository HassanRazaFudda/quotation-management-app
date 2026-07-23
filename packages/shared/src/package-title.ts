/**
 * The package title, assembled rather than typed.
 *
 * It reads, for example:
 *   "Hajj 2027/1448 Maktab A Category - 28 Days Package (Customize)"
 *
 * Built in three parts so it can fill in as the staff member works: the season
 * is known immediately, the category once it is picked, and the day count only
 * once the itinerary is finished.
 */

export interface PackageTitleParts {
  /** Hijri year, e.g. "1448". */
  season: string;
  /** Gregorian year the Hajj falls in, e.g. 2027. Derived from the calendar. */
  gregorianYear?: number | null;
  /** e.g. "Maktab A Category". */
  category?: string;
  /**
   * Nights across the whole itinerary. The package is quoted in days, which is
   * one more than the nights (the day of arrival counts).
   */
  totalNights?: number;
  /** Only append the day count once the itinerary is finalised. */
  itineraryComplete?: boolean;
  suffix?: string;
}

export const PACKAGE_TITLE_SUFFIX = "Package (Customize)";

/** Days quoted for a package: nights plus the arrival day. */
export const daysForNights = (nights: number): number => (nights > 0 ? nights + 1 : 0);

export function buildPackageTitle(parts: PackageTitleParts): string {
  const season = parts.gregorianYear
    ? `Hajj ${parts.gregorianYear}/${parts.season}`
    : `Hajj ${parts.season}`;

  const pieces = [season];
  if (parts.category?.trim()) pieces.push(parts.category.trim());

  const head = pieces.join(" ");

  if (parts.itineraryComplete && parts.totalNights && parts.totalNights > 0) {
    const days = daysForNights(parts.totalNights);
    return `${head} - ${days} Days ${parts.suffix ?? PACKAGE_TITLE_SUFFIX}`;
  }

  return head;
}
