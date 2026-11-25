/**
 * The passenger sheet: every person on every confirmed Hajj booking of a
 * season, one row each, built by the shared `passengerSheetRows`.
 */

import { categoryCode, passengerSheetRows, type PassengerSheetRow } from "@junaidi/shared";

import { QuotationModel } from "../models/quotation";

export interface PassengerSheetFilter {
  /** Hijri season, e.g. "1448". Absent: the latest season with a confirmed booking. */
  season?: string;
  /** The assigned staff name, exactly. */
  staff?: string;
  /** The category code as printed, e.g. "A". */
  category?: string;
  /** Matches the HB number, quotation number, guest, or any passenger's name or passport. */
  search?: string;
}

export interface PassengerSheetBooking {
  id: string;
  quotationId: string;
  rows: PassengerSheetRow[];
}

export interface PassengerSheet {
  season: string;
  seasons: string[];
  staff: string[];
  categories: string[];
  bookings: PassengerSheetBooking[];
}

const escapeRegex = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export async function listPassengerSheet(filter: PassengerSheetFilter = {}): Promise<PassengerSheet> {
  const seasons = ((await QuotationModel.distinct("season", { status: "confirmed" })) as string[])
    .filter(Boolean)
    .sort()
    .reverse();
  const season = filter.season?.trim() || seasons[0] || "";

  const query: Record<string, unknown> = { status: "confirmed", season };
  const search = filter.search?.trim();
  if (search) {
    const pattern = new RegExp(escapeRegex(search), "i");
    query.$or = [
      { hbNumber: pattern },
      { quotationId: pattern },
      { "guest.name": pattern },
      { "passengers.surname": pattern },
      { "passengers.givenName": pattern },
      { "passengers.passportNo": pattern },
    ];
  }

  const docs = await QuotationModel.find(query)
    .select(
      "quotationId hbNumber date guest assignedStaff packageCategory totalNights finalTotal priceAsWhole flight stays passengers",
    )
    .sort({ date: 1, hbNumber: 1, _id: 1 })
    .lean();

  // The filter lists come from the whole season, so a filter never hides its own options.
  const all = await QuotationModel.find({ status: "confirmed", season })
    .select("assignedStaff packageCategory")
    .lean();
  const staff = [...new Set(all.map((doc) => doc.assignedStaff?.name?.trim() ?? "").filter(Boolean))].sort();
  const categories = [...new Set(all.map((doc) => categoryCode(doc.packageCategory ?? "")).filter(Boolean))].sort();

  const bookings = docs
    .filter((doc) => !filter.staff || (doc.assignedStaff?.name ?? "").trim() === filter.staff)
    .filter((doc) => !filter.category || categoryCode(doc.packageCategory ?? "") === filter.category)
    .map((doc) => ({
      id: String(doc._id),
      quotationId: doc.quotationId,
      rows: passengerSheetRows(doc as never),
    }));

  return { season, seasons, staff, categories, bookings };
}
