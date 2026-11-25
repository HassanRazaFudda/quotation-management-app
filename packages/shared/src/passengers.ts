import { perPersonShare } from "./pricing";

/**
 * Hajj passengers on a confirmed booking, and the office's passenger sheet.
 *
 * A quotation is priced for a party (`guest.pax`); once confirmed, each person
 * in that party can be recorded - name, passport, contact - and, where a stay
 * is split across several rooms, which room they are in. Every field is
 * optional: a blank stays blank in the sheet, never filled with a guess.
 *
 * `passengerSheetRows` turns a booking into the sheet's rows, one per person,
 * in the exact column order of the office Excel (`PASSENGER_SHEET_COLUMNS`).
 */

// -------------------------------------------------------------------- types

export const PASSENGER_GENDERS = ["male", "female"] as const;
export type PassengerGender = (typeof PASSENGER_GENDERS)[number];

export interface Passenger {
  surname: string;
  givenName: string;
  gender: PassengerGender | "";
  passportNo: string;
  contact: string;
  email: string;
  preRegNo: string;
  /**
   * One entry per stay, aligned with `stays`: the index of the room in that
   * stay's split the person is in, or -1 when the stay is not split or nobody
   * has assigned them yet.
   */
  roomPicks: number[];
}

/** One room of a split stay, as frozen on the quotation. */
export interface SheetRoom {
  accommodationName?: string;
  occupancy?: string | null;
  roomType?: string | null;
  roomLabel?: string;
  minaTier?: string | null;
  headcount: number;
}

export interface SheetStay {
  locationType: string;
  blockLabelHijri: string;
  blockStartGregorian?: string;
  blockEndGregorian?: string;
  accommodationName: string;
  occupancy?: string | null;
  roomType?: string | null;
  roomLabel?: string;
  minaTier?: string | null;
  /** A split stay's rooms; empty when the whole party shares one choice. */
  rooms?: SheetRoom[];
}

/** Only what the sheet is built from. */
export interface SheetBooking {
  hbNumber?: string;
  date: Date | string;
  guest: { name: string; pax: number };
  assignedStaff?: { name?: string } | null;
  packageCategory?: string;
  totalNights?: number;
  /** Already final: per person, or the whole booking when `priceAsWhole`. */
  finalTotal?: number;
  priceAsWhole?: boolean;
  flight?: {
    included?: boolean;
    outbound?: { destination?: string } | null;
    inbound?: { origin?: string } | null;
  } | null;
  stays: SheetStay[];
  passengers?: Array<Partial<Passenger>>;
}

export const emptyPassenger = (stays: number): Passenger => ({
  surname: "",
  givenName: "",
  gender: "",
  passportNo: "",
  contact: "",
  email: "",
  preRegNo: "",
  roomPicks: Array.from({ length: stays }, () => -1),
});

/** A stored passenger with every field present, its picks aligned to the stays. */
export function normalisePassenger(input: Partial<Passenger> | undefined, stays: number): Passenger {
  const text = (value: unknown) => (typeof value === "string" ? value.trim() : "");
  const gender = input?.gender === "male" || input?.gender === "female" ? input.gender : "";
  return {
    surname: text(input?.surname),
    givenName: text(input?.givenName),
    gender,
    passportNo: text(input?.passportNo),
    contact: text(input?.contact),
    email: text(input?.email),
    preRegNo: text(input?.preRegNo),
    roomPicks: Array.from({ length: stays }, (_, index) => {
      const pick = input?.roomPicks?.[index];
      return typeof pick === "number" && Number.isInteger(pick) && pick >= 0 ? pick : -1;
    }),
  };
}

/** The booking's passengers, padded with blank ones up to its pax. */
export function passengersFor(booking: Pick<SheetBooking, "guest" | "stays" | "passengers">): Passenger[] {
  const pax = Math.max(1, Math.round(booking.guest.pax || 1));
  const saved = booking.passengers ?? [];
  return Array.from({ length: pax }, (_, index) => normalisePassenger(saved[index], booking.stays.length));
}

/** Does this passenger have anything still blank? (Room picks aside.) */
export function passengerIncomplete(passenger: Passenger): boolean {
  return [
    passenger.surname,
    passenger.givenName,
    passenger.gender,
    passenger.passportNo,
    passenger.contact,
    passenger.email,
    passenger.preRegNo,
  ].some((value) => !value);
}

// ------------------------------------------------------------- room picks

const isSplit = (stay: SheetStay): boolean => (stay.rooms?.length ?? 0) > 0;

/**
 * Wrong data is refused; missing data never is. A room may not hold more people
 * than its headcount, and a pick must name a room that exists. Unassigned and
 * partly assigned passengers are fine.
 */
export function validateRoomPicks(stays: SheetStay[], passengers: Array<Pick<Passenger, "roomPicks">>): string[] {
  const errors: string[] = [];
  stays.forEach((stay, stayIndex) => {
    const rooms = stay.rooms ?? [];
    const taken = rooms.map(() => 0);
    for (const passenger of passengers) {
      const pick = passenger.roomPicks[stayIndex] ?? -1;
      if (pick < 0) continue;
      if (!isSplit(stay) || pick >= rooms.length) {
        errors.push(`${stay.locationType} stay ${stayIndex + 1}: a passenger is assigned to a room that does not exist.`);
        return;
      }
      taken[pick]! += 1;
    }
    rooms.forEach((room, roomIndex) => {
      if (taken[roomIndex]! > room.headcount) {
        const name = roomText(room) || `room ${roomIndex + 1}`;
        errors.push(
          `${stay.accommodationName}: ${name} holds ${room.headcount} but ${taken[roomIndex]} passengers are assigned to it.`,
        );
      }
    });
  });
  return errors;
}

// -------------------------------------------------------------------- sheet

/** The office Excel's headers, in its order. Some repeat (SECTOR, HOTEL, DATE). */
export const PASSENGER_SHEET_COLUMNS = [
  "S NO.",
  "HB NO.",
  "BOOKING DATE",
  "PRE REG NO ",
  "REG EMAIL ID",
  "REMARKS",
  "BOOKING STATUS",
  "CONT",
  "SUR NAME",
  "GIVING NAME",
  "CO",
  "SALES STAFF",
  "AZIZIA",
  "MAK/MADINA",
  "MINA",
  "SPECIAL SERVICES",
  "GENDER",
  "PASSPORT NO.",
  "DAYS",
  "CATEGORY",
  "PKG AMOUNT",
  "TRAIN",
  "TKT STATUS",
  "ARRIVAL DATE",
  "FLIGHT NO",
  "SECTOR",
  "ARRIVAL TIME",
  "DEPARTURE DATE",
  "DEPARTURE FLIGHT #",
  "SECTOR",
  "DEPARTURE TIME",
  "MAKKAH 1ST SESSION",
  "HOTEL",
  "MAKKAH 2ND SESSION",
  "HOTEL",
  "AZIZIA SECTION",
  "HOTEL",
  "AZIZIA 2ND SECTION",
  "HOTEL",
  "AZIZIA 3RD SECTION",
  "HOTEL",
  "MADINA 1ST SESSION",
  "MADINA HOTEL",
  "MADINA 2ND SESSION",
  "MADINA HOTEL",
  "IST INT",
  "DATE",
  "2ND",
  "DATE",
] as const;

/** One stay as one passenger lives it: the block, and the hotel of their room. */
export interface SheetSession {
  block: string;
  hotel: string;
}

export interface PassengerSheetRow {
  /** Position of the passenger within the booking, from 1. */
  passengerNo: number;
  hbNumber: string;
  bookingDate: Date | null;
  guestName: string;
  passenger: Passenger;
  salesStaff: string;
  aziziaRoom: string;
  makkahMadinahRoom: string;
  mina: string;
  days: number;
  category: string;
  packageAmount: number;
  ticketStatus: "WITH TICKET" | "WITHOUT TICKET";
  arrivalDate: Date | null;
  arrivalSector: string;
  departureDate: Date | null;
  departureSector: string;
  makkah: SheetSession[];
  azizia: SheetSession[];
  madinah: SheetSession[];
}

/** "Double" / "Separate - Triple" / "Deluxe" ... what the room is called. */
function roomText(room: Pick<SheetRoom, "occupancy" | "roomType" | "roomLabel" | "minaTier">): string {
  const text = room.roomLabel?.trim() || room.occupancy?.trim() || room.minaTier?.trim() || room.roomType?.trim() || "";
  return text.toUpperCase();
}

/** People per room, for the sizes whose name says it; 0 when unknown (e.g. Sharing). */
function roomCapacity(name: string): number {
  const text = name.toLowerCase();
  if (/sharing/.test(text)) return 0;
  if (/\b(dbl|double|twin)\b/.test(text)) return 2;
  if (/\b(trp|tpl|triple)\b/.test(text)) return 3;
  if (/\bquad\b/.test(text)) return 4;
  if (/\bquint\b/.test(text)) return 5;
  if (/\b(sext|sextuple|hexa)\b/.test(text)) return 6;
  return 0;
}

/**
 * Each passenger's room in one stay, as the sheet prints it: the room's name
 * on the first person in each room and "-" on the rest, as the office file
 * does. In a split stay, an unassigned person's cell is blank.
 */
function roomCells(stay: SheetStay, passengers: Passenger[], stayIndex: number): string[] {
  const groups = new Map<string, number>();
  const cell = (key: string, name: string): string => {
    if (!name) return "";
    const seen = groups.get(key) ?? 0;
    groups.set(key, seen + 1);
    const capacity = roomCapacity(name);
    // The first person of every room shows the room; capacity unknown means one group.
    const first = capacity > 0 ? seen % capacity === 0 : seen === 0;
    return first ? name : "-";
  };

  if (!isSplit(stay)) {
    const name = roomText(stay);
    return passengers.map(() => cell("all", name));
  }
  const rooms = stay.rooms ?? [];
  return passengers.map((passenger) => {
    const pick = passenger.roomPicks[stayIndex] ?? -1;
    const room = rooms[pick];
    return room ? cell(String(pick), roomText(room)) : "";
  });
}

/** The hotel a passenger stays at in one stay: a split room can be its own hotel. */
function hotelFor(stay: SheetStay, passenger: Passenger, stayIndex: number): string {
  if (!isSplit(stay)) return stay.accommodationName;
  const room = (stay.rooms ?? [])[passenger.roomPicks[stayIndex] ?? -1];
  if (!room) {
    // Unassigned: the hotel is still known when every room is in the same one.
    const hotels = new Set((stay.rooms ?? []).map((entry) => entry.accommodationName || stay.accommodationName));
    return hotels.size === 1 ? [...hotels][0]! : "";
  }
  return room.accommodationName || stay.accommodationName;
}

/** The office's short month names on the sheet: "04 Zilhaj - 14 Zilhaj" -> "04 ZH - 14 ZH". */
const SHORT_MONTHS: Record<string, string> = {
  Muharram: "MH",
  Shawwal: "SH",
  Zilqad: "ZQ",
  Zilhaj: "ZH",
};

export function shortHijriLabel(label: string): string {
  return label.replace(/\b(Muharram|Shawwal|Zilqad|Zilhaj)\b/g, (month) => SHORT_MONTHS[month] ?? month);
}

/** "2027-05-07" (or a Date) to a UTC date, or null. */
function toDate(value: Date | string | undefined | null): Date | null {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (match) return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/** "Maktab A Category" -> "A"; anything else as stored. */
export function categoryCode(category: string | undefined): string {
  const text = (category ?? "").trim();
  const match = /\b([A-Z]{1,2})\s+category\b/i.exec(text);
  return match ? match[1]!.toUpperCase() : text;
}

/** The booking's passengers as sheet rows, one per person. */
export function passengerSheetRows(booking: SheetBooking): PassengerSheetRow[] {
  const passengers = passengersFor(booking);
  const stays = booking.stays;
  const nights = booking.totalNights ?? 0;
  const first = stays[0];
  const last = stays[stays.length - 1];

  const byType = (type: string) =>
    stays.map((stay, index) => ({ stay, index })).filter(({ stay }) => stay.locationType === type);
  const makkahStays = byType("makkah");
  const aziziaStays = byType("aziziya");
  const madinahStays = byType("madinah");
  const minaStays = byType("mina");

  // Per stay, each passenger's room cell, worked out once for the whole party.
  const cells = new Map<number, string[]>();
  const cellsFor = (index: number) => {
    let found = cells.get(index);
    if (!found) {
      found = roomCells(stays[index]!, passengers, index);
      cells.set(index, found);
    }
    return found;
  };
  // The Makkah/Madinah room is the first Makkah stay's, or Madinah's when there is none.
  const hotelRoomStay = makkahStays[0] ?? madinahStays[0];

  return passengers.map((passenger, p) => {
    const sessions = (list: Array<{ stay: SheetStay; index: number }>) =>
      list.map(({ stay, index }) => ({ block: shortHijriLabel(stay.blockLabelHijri), hotel: hotelFor(stay, passenger, index) }));
    return {
      passengerNo: p + 1,
      hbNumber: (booking.hbNumber ?? "").trim(),
      bookingDate: toDate(booking.date),
      guestName: booking.guest.name,
      passenger,
      salesStaff: booking.assignedStaff?.name?.trim() ?? "",
      aziziaRoom: aziziaStays[0] ? cellsFor(aziziaStays[0].index)[p]! : "",
      makkahMadinahRoom: hotelRoomStay ? cellsFor(hotelRoomStay.index)[p]! : "",
      mina: minaStays[0] ? cellsFor(minaStays[0].index)[p]! : "",
      days: nights > 0 ? nights + 1 : 0,
      category: categoryCode(booking.packageCategory),
      // A whole-booking price is shared out, so the column adds up to the booking.
      packageAmount: perPersonShare({ finalTotal: booking.finalTotal ?? 0, priceAsWhole: booking.priceAsWhole, guest: booking.guest }),
      ticketStatus: booking.flight?.included ? "WITH TICKET" : "WITHOUT TICKET",
      arrivalDate: toDate(first?.blockStartGregorian),
      arrivalSector: booking.flight?.included ? (booking.flight.outbound?.destination ?? "").trim() : "",
      departureDate: toDate(last?.blockEndGregorian),
      departureSector: booking.flight?.included ? (booking.flight.inbound?.origin ?? "").trim() : "",
      makkah: sessions(makkahStays),
      azizia: sessions(aziziaStays),
      madinah: sessions(madinahStays),
    };
  });
}

/** A sheet row as the Excel's 49 cells, in `PASSENGER_SHEET_COLUMNS` order. */
export function passengerSheetCells(row: PassengerSheetRow, serial: number): Array<string | number | Date | null> {
  const session = (list: SheetSession[], index: number): [string, string] => [
    list[index]?.block ?? "",
    list[index]?.hotel ?? "",
  ];
  const gender = row.passenger.gender ? row.passenger.gender.toUpperCase() : "";
  return [
    serial,
    row.hbNumber,
    row.bookingDate,
    row.passenger.preRegNo,
    row.passenger.email,
    "", // REMARKS
    "CONFIRM",
    row.passenger.contact,
    row.passenger.surname,
    row.passenger.givenName,
    "", // CO
    row.salesStaff,
    row.aziziaRoom,
    row.makkahMadinahRoom,
    row.mina,
    "", // SPECIAL SERVICES
    gender,
    row.passenger.passportNo,
    row.days > 0 ? `${row.days} DAYS` : "",
    row.category,
    row.packageAmount,
    "", // TRAIN
    row.ticketStatus,
    row.arrivalDate,
    "", // FLIGHT NO
    row.arrivalSector,
    "", // ARRIVAL TIME
    row.departureDate,
    "", // DEPARTURE FLIGHT #
    row.departureSector,
    "", // DEPARTURE TIME
    ...session(row.makkah, 0),
    ...session(row.makkah, 1),
    ...session(row.azizia, 0),
    ...session(row.azizia, 1),
    ...session(row.azizia, 2),
    ...session(row.madinah, 0),
    ...session(row.madinah, 1),
    "", // IST INT
    "", // DATE
    "", // 2ND
    "", // DATE
  ];
}
