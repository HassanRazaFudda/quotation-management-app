/**
 * Room choices for a stay.
 *
 * The guest picks a room per stay, not once for the whole quotation - a shared
 * room in Makkah and a private one in Aziziya is normal.
 *
 * A shared room is written as "Sharing" rather than a number, because it is
 * usually four but can be five or six and naming a size would over-promise.
 * When the group fills whole rooms of one size - four, five or six, or any
 * multiple - that size is offered as an extra wording which prices identically.
 *
 * A hotel only offers the sizes it actually has, which the admin sets per
 * hotel.
 */

import {
  MINA_TIERS,
  OCCUPANCIES,
  SHARING_WORDS,
  SHARING_WORD_SIZE,
  type AziziyaRoomType,
  type Occupancy,
  type PricingModel,
  type RoomEntry,
  type SharingWord,
} from "./types";

/** People assigned across a stay's room mix. Zero when it has no mix at all. */
export function allocatedHeadcount(rooms: RoomEntry[] | undefined): number {
  return (rooms ?? []).reduce((sum, room) => sum + Math.max(0, Math.round(room.headcount)), 0);
}

export interface RoomChoice {
  /** Stable value for a <select>. */
  value: string;
  /** What the staff member and the customer both read. */
  label: string;
  roomType: AziziyaRoomType | null;
  occupancy: Occupancy | null;
  sharingWord: SharingWord | null;
  /** Priced at the hotel's no-bed rate; used inside a room mix. */
  withoutBed?: boolean;
}

const SHARING: Omit<RoomChoice, "label" | "value"> = {
  roomType: "sharing",
  occupancy: "Sharing",
  sharingWord: null,
};

/**
 * The sizes this group could be written as.
 *
 * Twelve guests fill three quad rooms or two six-bed rooms, so both "Quad" and
 * "Hexa" are on offer; seven guests fill nothing evenly and get none.
 *
 * @param words The vocabulary to check, and @param sizes how many people each
 *   one means - normally the admin's `RoomSize` list. Both default to the
 *   original fixed three, so a caller with no config yet still works.
 */
export function sharingWordsFor(
  pax: number,
  words: readonly string[] = SHARING_WORDS,
  sizes: Record<string, number> = SHARING_WORD_SIZE,
): string[] {
  if (pax <= 0) return [];
  return words.filter((word) => sizes[word] && pax % sizes[word]! === 0);
}

/** Kept for the PAX hint: is any exact wording available at this group size? */
export const sharingWordAvailable = (pax: number): boolean => sharingWordsFor(pax).length > 0;

/**
 * The choices offered for a group of `pax` people at this hotel.
 *
 * "Sharing" stays the one fixed anchor: it is the flexible shared room's own
 * rate, so a hotel without it has no shared room at all. Every other size -
 * Triple, Double, or anything an admin has added for this hotel - is just "the
 * rest of `allowedOccupancies`", priced as its own room. "Quad" is not this
 * anchor - it is an ordinary wording choice for "Sharing", exactly like Quint
 * or Hexa, offered only when the admin has picked it AND `pax` fills whole
 * rooms of that size.
 *
 * The same rule applies whether `pax` is a whole stay's party or one room's
 * own headcount inside a mix - the caller decides which, so a 4-person row in
 * a split can be labelled "Quad" exactly as a 4-person stay can.
 *
 * @param allowedOccupancies Room sizes (rates) the hotel has. Empty means all.
 * @param allowedSharingWords Words the hotel's shared room may be written as
 *   (Quad, Quint, Hexa, ...). Empty means all — so a group that fills whole
 *   rooms of a size the hotel does not have is quoted plain "Sharing" rather
 *   than that size.
 * @param wordSizes How many people each sharing word means - the admin's
 *   `RoomSize` list. Defaults to the original three.
 */
export function roomChoices(
  model: PricingModel,
  pax: number,
  allowedOccupancies: string[] = [],
  allowedSharingWords: string[] = [],
  wordSizes: Record<string, number> = SHARING_WORD_SIZE,
): RoomChoice[] {
  if (model === "flat") return []; // a Mina tent has no room choice

  const allowed = allowedOccupancies.length > 0 ? allowedOccupancies : [...OCCUPANCIES];
  // Every priced size besides the base "Sharing" rate.
  const extraOccupancies = allowed.filter((o) => o !== "Sharing");

  const choices: RoomChoice[] = [];

  // The shared room is priced as Sharing, so a hotel without a Sharing rate
  // has no shared option at all - and no wording for one either.
  if (allowed.includes("Sharing")) {
    choices.push({ ...SHARING, value: "sharing", label: "Sharing" });

    const words = sharingWordsFor(
      pax,
      allowedSharingWords.length > 0 ? allowedSharingWords : [...SHARING_WORDS],
      wordSizes,
    );

    for (const word of words) {
      choices.push({
        ...SHARING,
        value: `sharing-${word.toLowerCase()}`,
        label: word,
        sharingWord: word,
      });
    }
  }

  if (model === "byOccupancy") {
    // Hotels: the shared room IS the Sharing rate; every other size is private.
    for (const occupancy of extraOccupancies) {
      choices.push({
        value: occupancy.toLowerCase(),
        label: occupancy,
        roomType: "sharing",
        occupancy,
        sharingWord: null,
      });
    }
  } else {
    // Aziziya: sharing is one figure; a Separate room is a private room in any
    // other size the hotel has. A group wanting a room to itself takes Sharing
    // (quoted with its own size), so a Separate Sharing is not offered.
    for (const occupancy of extraOccupancies) {
      choices.push({
        value: `separate-${occupancy.toLowerCase()}`,
        label: `Separate - ${occupancy}`,
        roomType: "separate",
        occupancy,
        sharingWord: null,
      });
    }
  }

  // A guest sharing a room without their own bed - a child, or a fifth in a
  // Quad. Priced at the hotel's own no-bed rate, used inside a room mix.
  choices.push({
    value: "without-bed",
    label: "Without bed",
    roomType: null,
    occupancy: null,
    sharingWord: null,
    withoutBed: true,
  });
  return choices;
}

interface StayRoom {
  roomType?: AziziyaRoomType | null;
  occupancy?: Occupancy | null;
  sharingWord?: SharingWord | null;
  withoutBed?: boolean | null;
}

/** Which choice a stay currently represents, for populating a <select>. */
export function roomChoiceValue(stay: StayRoom): string {
  if (stay.withoutBed) return "without-bed";
  if (stay.roomType === "separate") {
    return stay.occupancy ? `separate-${stay.occupancy.toLowerCase()}` : "";
  }
  if (stay.roomType === "sharing") {
    if (stay.sharingWord) return `sharing-${stay.sharingWord.toLowerCase()}`;
    if (stay.occupancy && stay.occupancy !== "Sharing") return stay.occupancy.toLowerCase();
    return "sharing";
  }
  return "";
}

/** How the room reads on the quotation: "Sharing", "Quint", "Separate - Triple". */
export function roomLabel(stay: StayRoom): string {
  if (stay.withoutBed) return "Without bed";
  if (stay.roomType === "separate") {
    return stay.occupancy ? `Separate - ${stay.occupancy}` : "Separate";
  }
  if (stay.roomType === "sharing") {
    if (stay.sharingWord) return stay.sharingWord;
    if (stay.occupancy && stay.occupancy !== "Sharing") return stay.occupancy;
    return "Sharing";
  }
  return "";
}

/**
 * How a Mina tier reads on the quotation - the counterpart to `roomLabel`, but
 * for the Hajj days. Each split entry is a whole accommodation (a tier or the
 * "Without Mina" option), not a room size, so its category is named from the
 * tent: "Standard", "Deluxe", "Premium", or "Without Mina". A tent that carries
 * its tier only in its name (e.g. "Mina Standard B Category") still resolves.
 */
export function minaCategoryLabel(input: {
  minaTier?: string | null;
  withoutMina?: boolean | null;
  accommodationName?: string | null;
}): string {
  if (input.withoutMina) return "Without Mina";
  const name = input.accommodationName ?? "";
  const tier = input.minaTier || MINA_TIERS.find((t) => name.toLowerCase().includes(t)) || "";
  return tier ? tier.charAt(0).toUpperCase() + tier.slice(1) : name;
}
