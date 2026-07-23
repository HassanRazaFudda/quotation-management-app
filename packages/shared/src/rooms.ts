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
  OCCUPANCIES,
  SHARING_WORDS,
  SHARING_WORD_SIZE,
  type AziziyaRoomType,
  type Occupancy,
  type PricingModel,
  type SharingWord,
} from "./types";

export interface RoomChoice {
  /** Stable value for a <select>. */
  value: string;
  /** What the staff member and the customer both read. */
  label: string;
  roomType: AziziyaRoomType | null;
  occupancy: Occupancy | null;
  sharingWord: SharingWord | null;
}

const SHARING: Omit<RoomChoice, "label" | "value"> = {
  roomType: "sharing",
  occupancy: "Quad",
  sharingWord: null,
};

/**
 * The sizes this group could be written as.
 *
 * Twelve guests fill three quad rooms or two six-bed rooms, so both "Quad" and
 * "Hexa" are on offer; seven guests fill nothing evenly and get none.
 */
export function sharingWordsFor(pax: number): SharingWord[] {
  if (pax <= 0) return [];
  return SHARING_WORDS.filter((word) => pax % SHARING_WORD_SIZE[word] === 0);
}

/** Kept for the PAX hint: is any exact wording available at this group size? */
export const sharingWordAvailable = (pax: number): boolean => sharingWordsFor(pax).length > 0;

/**
 * The choices offered for a stay.
 *
 * @param allowedOccupancies Room sizes (rates) the hotel has. Empty means all.
 * @param allowedSharingWords Sizes the hotel's shared rooms come in. Empty
 *   means all — so a group that fills whole rooms of a size the hotel does not
 *   have is quoted plain "Sharing" rather than that size.
 */
export function roomChoices(
  model: PricingModel,
  pax: number,
  allowedOccupancies: Occupancy[] = [],
  allowedSharingWords: SharingWord[] = [],
): RoomChoice[] {
  if (model === "flat") return []; // a Mina tent has no room choice

  const allowed = allowedOccupancies.length > 0 ? allowedOccupancies : [...OCCUPANCIES];
  const choices: RoomChoice[] = [];

  // The shared room is priced as a Quad, so a hotel without quad rooms has no
  // shared option at all - and no wording for one either.
  if (allowed.includes("Quad")) {
    choices.push({ ...SHARING, value: "sharing", label: "Sharing" });

    const words =
      allowedSharingWords.length > 0
        ? sharingWordsFor(pax).filter((w) => allowedSharingWords.includes(w))
        : sharingWordsFor(pax);

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
    // Hotels: the shared room IS the Quad rate; Triple and Double are private.
    for (const occupancy of ["Triple", "Double"] as const) {
      if (!allowed.includes(occupancy)) continue;
      choices.push({
        value: occupancy.toLowerCase(),
        label: occupancy,
        roomType: "sharing",
        occupancy,
        sharingWord: null,
      });
    }
    return choices;
  }

  // Aziziya: sharing is one figure; a Separate room is a private Triple or
  // Double. A group wanting a room to itself takes Sharing (quoted with its
  // own size), so a Separate Quad is not offered.
  for (const occupancy of ["Triple", "Double"] as const) {
    if (!allowed.includes(occupancy)) continue;
    choices.push({
      value: `separate-${occupancy.toLowerCase()}`,
      label: `Separate - ${occupancy}`,
      roomType: "separate",
      occupancy,
      sharingWord: null,
    });
  }
  return choices;
}

interface StayRoom {
  roomType?: AziziyaRoomType | null;
  occupancy?: Occupancy | null;
  sharingWord?: SharingWord | null;
}

/** Which choice a stay currently represents, for populating a <select>. */
export function roomChoiceValue(stay: StayRoom): string {
  if (stay.roomType === "separate") {
    return stay.occupancy ? `separate-${stay.occupancy.toLowerCase()}` : "";
  }
  if (stay.roomType === "sharing") {
    if (stay.sharingWord) return `sharing-${stay.sharingWord.toLowerCase()}`;
    if (stay.occupancy && stay.occupancy !== "Quad") return stay.occupancy.toLowerCase();
    return "sharing";
  }
  return "";
}

/** How the room reads on the quotation: "Sharing", "Quint", "Separate - Triple". */
export function roomLabel(stay: StayRoom): string {
  if (stay.roomType === "separate") {
    return stay.occupancy ? `Separate - ${stay.occupancy}` : "Separate";
  }
  if (stay.roomType === "sharing") {
    if (stay.sharingWord) return stay.sharingWord;
    if (stay.occupancy && stay.occupancy !== "Quad") return stay.occupancy;
    return "Sharing";
  }
  return "";
}
