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
  perRoom = false,
): RoomChoice[] {
  if (model === "flat") return []; // a Mina tent has no room choice

  const allowed = allowedOccupancies.length > 0 ? allowedOccupancies : [...OCCUPANCIES];

  // A guest sharing a room without their own bed - a child, or a fifth in a
  // Quad. Priced at the hotel's own no-bed rate, used inside a room mix.
  const noBed: RoomChoice = {
    value: "without-bed",
    label: "Without bed",
    roomType: null,
    occupancy: null,
    sharingWord: null,
    withoutBed: true,
  };

  // Inside a room mix each entry is one explicit room, so the sizes are named
  // outright - and offered whatever the party count, since each entry carries
  // its own headcount rather than the whole party's.
  if (perRoom) {
    const roomsFor: RoomChoice[] = [];

    if (model === "byOccupancy") {
      // A hotel: Quad (the shared/Quad rate), Triple, Double.
      for (const occupancy of OCCUPANCIES) {
        if (!allowed.includes(occupancy)) continue;
        roomsFor.push({
          value: occupancy === "Quad" ? "sharing-quad" : occupancy.toLowerCase(),
          label: occupancy,
          roomType: "sharing",
          occupancy,
          sharingWord: occupancy === "Quad" ? "Quad" : null,
        });
      }
    } else {
      // Aziziya: one shared figure, named generically or by its size (Quad /
      // Quint / Hexa), plus a private Triple or Double.
      roomsFor.push({ ...SHARING, value: "sharing", label: "Sharing" });
      const words = allowedSharingWords.length > 0 ? allowedSharingWords : [...SHARING_WORDS];
      for (const word of words) {
        roomsFor.push({ ...SHARING, value: `sharing-${word.toLowerCase()}`, label: word, sharingWord: word });
      }
      for (const occupancy of ["Triple", "Double"] as const) {
        if (!allowed.includes(occupancy)) continue;
        roomsFor.push({
          value: `separate-${occupancy.toLowerCase()}`,
          label: `Separate - ${occupancy}`,
          roomType: "separate",
          occupancy,
          sharingWord: null,
        });
      }
    }

    roomsFor.push(noBed);
    return roomsFor;
  }

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
    choices.push(noBed);
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
  choices.push(noBed);
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
    if (stay.occupancy && stay.occupancy !== "Quad") return stay.occupancy.toLowerCase();
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
    if (stay.occupancy && stay.occupancy !== "Quad") return stay.occupancy;
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
