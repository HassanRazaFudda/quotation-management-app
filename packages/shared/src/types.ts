/**
 * Domain types for the Junaidi Hajj quotation system.
 *
 * Everything a quotation is built from is admin-configurable, so these types
 * describe *shapes*, not fixed lists. The only closed unions are the ones that
 * change how a price is calculated — adding a new one requires code.
 */

// ---------------------------------------------------------------- occupancy

export const OCCUPANCIES = ["Quad", "Triple", "Double"] as const;
export type Occupancy = (typeof OCCUPANCIES)[number];

/**
 * Words a shared room may be written as, and how many people each names.
 *
 * A shared room is quoted as "Sharing" because it is usually four but can be
 * five or six, and naming a number would over-promise. A group that fills
 * whole rooms of one size knows it will not be sharing with strangers, so for
 * them the number is safe to print - and only the wording changes, never the
 * price.
 */
export const SHARING_WORDS = ["Quad", "Quint", "Hexa"] as const;
export type SharingWord = (typeof SHARING_WORDS)[number];

export const SHARING_WORD_SIZE: Record<SharingWord, number> = {
  Quad: 4,
  Quint: 5,
  Hexa: 6,
};

/** Aziziya is quoted as a private room or a shared one, each with its own rates. */
export const AZIZIYA_ROOM_TYPES = ["separate", "sharing"] as const;
export type AziziyaRoomType = (typeof AZIZIYA_ROOM_TYPES)[number];

/** Mina tents, by how many Hajis share one camp. */
export const MINA_TIERS = ["standard", "premium", "deluxe"] as const;
export type MinaTier = (typeof MINA_TIERS)[number];

export const MINA_TIER_BEDS: Record<MinaTier, string> = {
  standard: "16 beds",
  premium: "12 beds",
  deluxe: "7-8 beds",
};

// ----------------------------------------------------------------- calendar

/**
 * Hijri months in order. Needed in full (not just Zilqad/Zilhaj) because the
 * admin defines their own date blocks and a long package can start earlier.
 */
export const HIJRI_MONTHS = [
  "Muharram",
  "Safar",
  "Rabi ul Awwal",
  "Rabi us Sani",
  "Jamadi ul Awwal",
  "Jamadi us Sani",
  "Rajab",
  "Shaban",
  "Ramadan",
  "Shawwal",
  "Zilqad",
  "Zilhaj",
] as const;
export type HijriMonth = (typeof HIJRI_MONTHS)[number];

export interface HijriDate {
  month: HijriMonth;
  day: number; // 1-30
}

/** One imported row of the Umm al-Qura calendar. */
export interface CalendarEntry {
  hijriYear: number;
  month: HijriMonth;
  day: number;
  /** ISO date string, e.g. "2026-06-13". Kept as a string to stay timezone-free. */
  gregorian: string;
}

// ---------------------------------------------------------------- locations

/**
 * The location type drives the pricing model and which extra fields a stay
 * needs (room type for Aziziya, tier for Mina).
 */
export const LOCATION_TYPES = [
  "madinah",
  "makkah",
  "aziziya",
  "mina",
  "arafat",
] as const;
export type LocationType = (typeof LOCATION_TYPES)[number];

/**
 * How an accommodation is priced.
 *
 * Hajj accommodation is not sold per night - a hotel is booked for a whole
 * date block and quoted as one negotiated figure for that block. So a rate
 * always belongs to an (accommodation, block) pair and is never multiplied by
 * the night count.
 */
export const PRICING_MODELS = [
  /** Makkah / Madinah hotels: block total per person, by occupancy. */
  "byOccupancy",
  /**
   * Aziziya. Sharing is a single figure with no occupancy - a shared room is
   * usually four but can be five or six, so it is quoted as "Sharing" rather
   * than committing to a number. Separate is a private room and does have
   * Quad / Triple / Double.
   */
  "sharingOrSeparate",
  /** Mina tents: one block total per tier; occupancy does not apply to a tent. */
  "flat",
] as const;
export type PricingModel = (typeof PRICING_MODELS)[number];

export interface Location {
  id: string;
  name: string;
  type: LocationType;
  pricingModel: PricingModel;
  sortOrder: number;
  active: boolean;
}

export interface Accommodation {
  id: string;
  locationId: string;
  name: string;
  /** Mina only. */
  minaTier?: MinaTier | null;
  bedsPerTent?: number | null;
  /**
   * The Mina option that books no tent at all. It is still a sold line — the
   * Muallim, transport and Arafat services are charged — so it carries rates
   * per block like any other accommodation.
   */
  withoutMina?: boolean;
  /**
   * Which room sizes this hotel actually has. Empty or absent means all of
   * them, so older configurations keep working.
   */
  allowedOccupancies?: Occupancy[];
  /**
   * How many people this hotel's shared rooms hold — Quad (4), Quint (5),
   * Hexa (6). Governs which exact wording may replace "Sharing" on the quote.
   * Empty or absent means all sizes, so older configurations keep working.
   */
  allowedSharingWords?: SharingWord[];
  /**
   * Package category ids this option may be sold under. Empty means any —
   * used to keep, say, Without Mina out of the categories that never offer it.
   */
  allowedCategories?: string[];
  allowedMealIds: string[];
  allowedMealNoteIds: string[];
  sortOrder: number;
  active: boolean;
}

export interface LabelledItem {
  id: string;
  label: string;
  sortOrder: number;
  active: boolean;
}

export type Meal = LabelledItem;
export type MealNote = LabelledItem;

/**
 * A package-level classification the customer sees on the quotation, e.g.
 * "Maktab A Category". Admin-defined and independent of the Mina tent choice -
 * it labels the whole package, not a single stay.
 */
export type PackageCategory = LabelledItem;

export const SERVICE_CATEGORIES = [
  "minaServices",
  "arafatServices",
  "includes",
  "requirements",
  "terms",
] as const;
export type ServiceCategory = (typeof SERVICE_CATEGORIES)[number];

export interface ServiceItem extends LabelledItem {
  category: ServiceCategory;
  defaultSelected: boolean;
  /** Hex colour for this line on the quotation, or "" for the default (black). */
  color?: string;
  /** Print this line in bold. Off by default. */
  bold?: boolean;
}

/**
 * One line of a bullet list on the quotation, carrying its own styling. A plain
 * string is treated as an unstyled line, so quotations saved before styling
 * existed still render.
 */
export interface StyledLine {
  text: string;
  color?: string;
  bold?: boolean;
}

export function toStyledLine(value: string | StyledLine): StyledLine {
  return typeof value === "string" ? { text: value } : value;
}

/** A line's colour is only applied when it is a real, non-black hex value. */
export function lineColor(color: string | undefined): string {
  const value = (color ?? "").trim();
  return /^#[0-9a-fA-F]{3,8}$/.test(value) ? value : "";
}

// ------------------------------------------------------------- date blocks

export const BLOCK_PHASES = ["pre", "hajj", "post"] as const;
export type BlockPhase = (typeof BLOCK_PHASES)[number];

export interface DateBlock {
  id: string;
  season: string; // Hijri year, e.g. "1447"
  startHijri: HijriDate;
  endHijri: HijriDate;
  phase: BlockPhase;
  /** Which locations the admin allows a stay in, for this block. */
  allowedLocationIds: string[];
  sortOrder: number;
  active: boolean;
}

/** A date block with its calendar dates and night count worked out. */
export interface ResolvedBlock extends DateBlock {
  label: string;
  startGregorian: string | null;
  endGregorian: string | null;
  gregorianLabel: string | null;
  nights: number;
  /** True when nights came from the imported calendar rather than an estimate. */
  exact: boolean;
}

// ------------------------------------------------------------------- rates

/** Fields every rate carries: it is always for one accommodation in one block. */
interface RateBase {
  accommodationId: string;
  blockId: string;
  season: string;
  /**
   * Optional per-person figure for a guest who shares a room without their own
   * bed - a child, or a fifth pilgrim in a Quad. Cheaper than a bedded rate,
   * but the stay is still included. Set on room-based locations (hotels and
   * Aziziya); a Mina tent has no bed to price.
   */
  withoutBed?: number;
}

export interface RateByOccupancy extends RateBase {
  model: "byOccupancy";
  /** Total for the whole block, per person. */
  rates: Record<Occupancy, number>;
}

export interface RateSharingOrSeparate extends RateBase {
  model: "sharingOrSeparate";
  /** One block total per person. Sharing is not broken down by occupancy. */
  sharing: number;
  /** Block total per person for a private room, by occupancy. */
  separate: Record<Occupancy, number>;
}

export interface RateFlat extends RateBase {
  model: "flat";
  /** Total for the whole block, per person. */
  amount: number;
}

export type Rate = RateByOccupancy | RateSharingOrSeparate | RateFlat;

/** Rates are looked up by this pair. */
export const rateKey = (accommodationId: string, blockId: string): string =>
  `${accommodationId}:${blockId}`;

/**
 * A rate with every figure at zero, shaped for the location's pricing model.
 *
 * A hotel that has never been priced for a block has no rate row at all. The
 * admin screen starts one of these so there is somewhere to type - without it
 * a newly added date block could never be given a price.
 */
export function emptyRate(
  model: PricingModel,
  ids: { accommodationId: string; blockId: string; season: string },
): Rate {
  const zeroes = Object.fromEntries(OCCUPANCIES.map((o) => [o, 0])) as Record<
    Occupancy,
    number
  >;

  if (model === "flat") return { ...ids, model, amount: 0 };
  if (model === "sharingOrSeparate") {
    return { ...ids, model, sharing: 0, separate: zeroes, withoutBed: 0 };
  }
  return { ...ids, model, rates: zeroes, withoutBed: 0 };
}

// ------------------------------------------------------------------- stays

/**
 * One row of the itinerary as the staff member fills it in.
 *
 * Room choice is per stay, not per quotation: a guest can take a shared room in
 * Makkah and a private one in Aziziya. One dropdown covers it -
 * "Sharing / Triple / Double", plus "Separate - X" where the location offers it.
 */
export interface StayInput {
  blockId: string;
  locationId: string;
  accommodationId: string;

  /**
   * Which rate applies. `sharing` uses the shared figure (Aziziya) or the Quad
   * rate (hotels); `separate` uses the private-room rate. Null where the
   * location has no room choice at all, such as a Mina tent.
   */
  roomType?: AziziyaRoomType | null;
  /** Quad / Triple / Double. Not needed for an Aziziya sharing room. */
  occupancy?: Occupancy | null;
  /**
   * Print "Quad", "Quint" or "Hexa" instead of "Sharing". Display only — the
   * price is the sharing figure either way. Offered when the group fills whole
   * rooms of that size.
   */
  sharingWord?: SharingWord | null;
  /** This stay is priced at the no-bed rate (rare for a whole party; usual in a mix). */
  withoutBed?: boolean | null;

  mealId?: string | null;
  mealNoteId?: string | null;

  /**
   * A mix of rooms for one stay, e.g. a family of seven in one Quad and one
   * Triple room, or two pilgrims in different Mina tiers. Each entry prices its
   * own headcount at its own rate; the quotation shows the PAX-weighted average
   * per person. Absent (or empty) means the whole party shares the stay's own
   * room choice above — the ordinary case, priced exactly as before.
   */
  rooms?: RoomEntry[];
}

/**
 * One room allocation within a stay: a group of people all in the same room
 * choice (and possibly its own accommodation, since a Mina tier is a separate
 * accommodation), priced at that per-person rate.
 */
export interface RoomEntry {
  accommodationId: string;
  roomType?: AziziyaRoomType | null;
  occupancy?: Occupancy | null;
  sharingWord?: SharingWord | null;
  /** These people share a room without their own bed, at the no-bed rate. */
  withoutBed?: boolean | null;
  /** How many people are in rooms of this choice. */
  headcount: number;
}

/** A room entry after pricing: the resolved name, its per-person rate and cost. */
export interface PricedRoom extends RoomEntry {
  accommodationName: string;
  /** The per-person block rate for this room choice. */
  perPerson: number;
  /** `perPerson × headcount` — the group cost of this entry. */
  cost: number;
}

export interface PricedStay extends StayInput {
  nights: number;
  /** The unit rate actually applied, stored so old quotations never change. */
  rateSnapshot: number;
  /** Per person: the stay's group total divided by PAX (equals the rate when
   * the whole party shares one room choice). */
  lineTotal: number;
  /** The cost of the whole party's rooms for this stay. */
  groupTotal: number;
  /** The priced allocation — a single entry for an ordinary stay. */
  rooms: PricedRoom[];
}

// -------------------------------------------------------------- quotation

export interface QuotationTotals {
  totalNights: number;
  subtotal: number;
  /** Internal only. Must never reach the PDF. */
  discount: number;
  finalTotal: number;
  manualOverride: boolean;
}

// ------------------------------------------------------ package tier pricing

/**
 * A package is printed as up to three prices for the SAME itinerary - Quad,
 * Triple and Double - and each of those prices has its own controls. This is a
 * package-only concept: an individual customer quotation still carries a single
 * price and is untouched by any of this.
 */
export interface TierSetting {
  /** A typed-in price that replaces the calculated one. null = use calculated. */
  manualTotal: number | null;
  /** Taken off the calculated total. Internal - only the final figure prints. */
  discount: number;
}

/**
 * A package's three-price block. `enabled: false` leaves the package as a plain
 * reference set (today's behaviour); when on, each offered tier carries its own
 * settings and a tier left `null` is simply not offered - so a package can show
 * one, two or three prices. `offeredTiers` reads it into an ordered list.
 */
export interface TierPricing {
  enabled: boolean;
  Quad: TierSetting | null;
  Triple: TierSetting | null;
  Double: TierSetting | null;
}

/**
 * A per-room-type surcharge printed under a package's itinerary, e.g. "Aziziya
 * Triple Bed - PKR 200,000 /- per pax". Manually entered, like the tier prices:
 * the amount is a real charge the customer sees, not an internal figure.
 */
export interface PackageAddOn {
  label: string;
  amount: number;
}

// ------------------------------------------------------- config bundle

import type { FlightOption } from "./flights";

/** Everything the builder needs to render its dropdowns and price a quotation. */
export interface ConfigBundle {
  season: string;
  blocks: DateBlock[];
  locations: Location[];
  accommodations: Accommodation[];
  meals: Meal[];
  mealNotes: MealNote[];
  services: ServiceItem[];
  packageCategories: PackageCategory[];
  flights: FlightOption[];
  rates: Rate[];
  calendar: CalendarEntry[];
}
