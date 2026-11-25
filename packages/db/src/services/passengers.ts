/**
 * The passenger sheet: every person on every confirmed Hajj booking of a
 * season, one row each, built by the shared `passengerSheetRows`, then
 * narrowed by the shared `filterSheetRows`.
 */

import {
  filterByColumns,
  filterSheetRows,
  passengerSheetRows,
  sheetFilterOptions,
  type ColumnFilters,
  type PassengerSheetRow,
  type SheetFilterOptions,
  type SheetRowFilter,
} from "@junaidi/shared";

import { QuotationModel } from "../models/quotation";

export interface PassengerSheetFilter extends SheetRowFilter {
  /** Hijri season, e.g. "1448". Absent: the latest season with a confirmed booking. */
  season?: string;
  /** Excel-style: per column, the values kept. */
  columns?: ColumnFilters;
}

export interface PassengerSheetBooking {
  id: string;
  quotationId: string;
  rows: PassengerSheetRow[];
}

export interface PassengerSheet extends SheetFilterOptions {
  season: string;
  seasons: string[];
  /** Passengers in the season before any filter, so the page can say "filtered". */
  totalPassengers: number;
  bookings: PassengerSheetBooking[];
}

export async function listPassengerSheet(filter: PassengerSheetFilter = {}): Promise<PassengerSheet> {
  const seasons = ((await QuotationModel.distinct("season", { status: "confirmed" })) as string[])
    .filter(Boolean)
    .sort()
    .reverse();
  const season = filter.season?.trim() || seasons[0] || "";

  const docs = await QuotationModel.find({ status: "confirmed", season })
    .select(
      "quotationId hbNumber date guest assignedStaff careOf packageCategory totalNights finalTotal priceAsWhole flight stays passengers",
    )
    .sort({ date: 1, hbNumber: 1, _id: 1 })
    .lean();

  const all = docs.map((doc) => ({
    id: String(doc._id),
    quotationId: doc.quotationId,
    rows: passengerSheetRows(doc as never),
  }));

  // The choices come from the whole season, so a filter never hides its own options.
  const options = sheetFilterOptions(all.flatMap((booking) => booking.rows));

  const bookings = all
    .map((booking) => ({ ...booking, rows: filterByColumns(filterSheetRows(booking.rows, filter), filter.columns ?? {}) }))
    .filter((booking) => booking.rows.length > 0);

  return {
    season,
    seasons,
    ...options,
    totalPassengers: all.reduce((sum, booking) => sum + booking.rows.length, 0),
    bookings,
  };
}
