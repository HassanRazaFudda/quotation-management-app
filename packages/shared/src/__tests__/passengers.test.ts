import { describe, expect, it } from "vitest";

import {
  categoryCode,
  passengerSheetCells,
  passengerSheetRows,
  passengersFor,
  PASSENGER_SHEET_COLUMNS,
  shortHijriLabel,
  validateRoomPicks,
  type SheetBooking,
  type SheetStay,
} from "../passengers";

const makkah: SheetStay = {
  locationType: "makkah",
  blockLabelHijri: "14 Zilhaj - 20 Zilhaj",
  blockStartGregorian: "2027-05-20",
  blockEndGregorian: "2027-05-26",
  accommodationName: "Swiss Al Maqam",
  occupancy: "DBL",
};
const aziziya: SheetStay = {
  locationType: "aziziya",
  blockLabelHijri: "04 ZH - 14 ZH",
  blockStartGregorian: "2027-05-10",
  blockEndGregorian: "2027-05-20",
  accommodationName: "Diar Al Mashaer",
  rooms: [
    { accommodationName: "Diar Al Mashaer", roomLabel: "Double", headcount: 2 },
    { accommodationName: "Diar Al Mashaer", roomLabel: "Triple", headcount: 3 },
  ],
};
const mina: SheetStay = {
  locationType: "mina",
  blockLabelHijri: "08 ZH - 12 ZH",
  accommodationName: "Maktab 112",
  rooms: [
    { accommodationName: "Maktab 112", roomLabel: "Standard", headcount: 3 },
    { accommodationName: "Maktab 112", roomLabel: "Deluxe", headcount: 2 },
  ],
};
const madinah: SheetStay = {
  locationType: "madinah",
  blockLabelHijri: "20 ZH - 28 ZH",
  blockStartGregorian: "2027-05-26",
  blockEndGregorian: "2027-06-03",
  accommodationName: "Sofitel",
  occupancy: "QUAD",
};

const booking = (overrides: Partial<SheetBooking> = {}): SheetBooking => ({
  hbNumber: "HB-002038",
  date: "2026-07-20",
  guest: { name: "Muhammad Ahmed", pax: 5 },
  assignedStaff: { name: "Kamran Baig" },
  packageCategory: "Maktab A Category",
  totalNights: 24,
  finalTotal: 2_000_000,
  flight: { included: true, outbound: { destination: "JED" }, inbound: { origin: "MED" } },
  stays: [aziziya, mina, makkah, madinah],
  passengers: [],
  ...overrides,
});

const picks = (...values: number[]) => ({ roomPicks: values });

describe("validateRoomPicks", () => {
  const stays = [aziziya, mina];

  it("accepts nobody assigned, and a partial assignment", () => {
    expect(validateRoomPicks(stays, [picks(-1, -1), picks(-1, -1)])).toEqual([]);
    expect(validateRoomPicks(stays, [picks(0, 1), picks(1, -1), picks(-1, 0)])).toEqual([]);
  });

  it("refuses a room given more people than it holds", () => {
    const errors = validateRoomPicks(stays, [picks(0, -1), picks(0, -1), picks(0, -1)]);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("DOUBLE holds 2 but 3 passengers");
  });

  it("refuses a pick that names no room", () => {
    expect(validateRoomPicks(stays, [picks(5, -1)])).toHaveLength(1);
    expect(validateRoomPicks([makkah], [picks(0)])).toHaveLength(1);
  });
});

describe("passengerSheetRows", () => {
  it("makes one row per pax, padding passengers nobody has entered", () => {
    const rows = passengerSheetRows(
      booking({ passengers: [{ surname: "AHMED", givenName: "MUHAMMAD", gender: "male", passportNo: "AZ1" }] }),
    );
    expect(rows).toHaveLength(5);
    expect(rows[0]!.passenger).toMatchObject({ surname: "AHMED", givenName: "MUHAMMAD", gender: "male" });
    expect(rows[1]!.passenger).toMatchObject({ surname: "", givenName: "", gender: "", passportNo: "" });
    expect(rows.map((row) => row.passengerNo)).toEqual([1, 2, 3, 4, 5]);
  });

  it("repeats the booking's own details on every passenger", () => {
    for (const row of passengerSheetRows(booking())) {
      expect(row).toMatchObject({
        hbNumber: "HB-002038",
        salesStaff: "Kamran Baig",
        days: 25,
        category: "A",
        packageAmount: 2_000_000,
        ticketStatus: "WITH TICKET",
        arrivalSector: "JED",
        departureSector: "MED",
      });
      expect(row.bookingDate?.toISOString().slice(0, 10)).toBe("2026-07-20");
      expect(row.arrivalDate?.toISOString().slice(0, 10)).toBe("2027-05-10");
      expect(row.departureDate?.toISOString().slice(0, 10)).toBe("2027-06-03");
    }
  });

  it("names the room once per room, '-' for the others in it", () => {
    const rows = passengerSheetRows(booking({ guest: { name: "x", pax: 4 }, stays: [makkah] }));
    // Two doubles: the first person of each room shows DBL.
    expect(rows.map((row) => row.makkahMadinahRoom)).toEqual(["DBL", "-", "DBL", "-"]);
  });

  it("follows each passenger's room in a split stay, blank when unassigned", () => {
    const rows = passengerSheetRows(
      booking({
        passengers: [
          { roomPicks: [1, 0, -1, -1] },
          { roomPicks: [0, 0, -1, -1] },
          { roomPicks: [1, 1, -1, -1] },
          { roomPicks: [0, -1, -1, -1] },
          { roomPicks: [-1, -1, -1, -1] },
        ],
      }),
    );
    expect(rows.map((row) => row.aziziaRoom)).toEqual(["TRIPLE", "DOUBLE", "-", "-", ""]);
    expect(rows.map((row) => row.mina)).toEqual(["STANDARD", "-", "DELUXE", "", ""]);
  });

  it("fills each city's sessions in order, using a split room's own hotel", () => {
    const second = { ...makkah, blockLabelHijri: "20 ZH - 25 ZH", accommodationName: "Hilton" };
    const split: SheetStay = {
      ...aziziya,
      rooms: [
        { accommodationName: "Building 7", roomLabel: "Sharing", headcount: 3 },
        { accommodationName: "Diar Al Mashaer", roomLabel: "Double", headcount: 2 },
      ],
    };
    const [row] = passengerSheetRows(
      booking({ guest: { name: "x", pax: 1 }, stays: [split, makkah, second], passengers: [{ roomPicks: [1, -1, -1] }] }),
    );
    expect(row!.makkah).toEqual([
      { block: "14 ZH - 20 ZH", hotel: "Swiss Al Maqam" },
      { block: "20 ZH - 25 ZH", hotel: "Hilton" },
    ]);
    expect(row!.azizia).toEqual([{ block: "04 ZH - 14 ZH", hotel: "Diar Al Mashaer" }]);
    expect(row!.madinah).toEqual([]);
  });

  it("says WITHOUT TICKET, and leaves the sectors blank, when the ticket is not sold", () => {
    const [row] = passengerSheetRows(booking({ flight: { included: false } }));
    expect(row).toMatchObject({ ticketStatus: "WITHOUT TICKET", arrivalSector: "", departureSector: "" });
  });
});

describe("the Excel cells", () => {
  it("fills exactly the office file's 49 columns", () => {
    expect(PASSENGER_SHEET_COLUMNS).toHaveLength(49);
    const [row] = passengerSheetRows(booking({ passengers: [{ surname: "AHMED", gender: "female" }] }));
    const cells = passengerSheetCells(row!, 7);
    expect(cells).toHaveLength(49);
    const at = (header: string) => cells[PASSENGER_SHEET_COLUMNS.indexOf(header as never)];
    expect(at("S NO.")).toBe(7);
    expect(at("BOOKING STATUS")).toBe("CONFIRM");
    expect(at("SUR NAME")).toBe("AHMED");
    expect(at("GENDER")).toBe("FEMALE");
    expect(at("DAYS")).toBe("25 DAYS");
    expect(at("TKT STATUS")).toBe("WITH TICKET");
    expect(at("MAKKAH 1ST SESSION")).toBe("14 ZH - 20 ZH");
    // The columns the system does not keep stay blank.
    for (const blank of ["REMARKS", "CO", "SPECIAL SERVICES", "TRAIN", "FLIGHT NO", "IST INT"]) {
      expect(at(blank)).toBe("");
    }
  });
});

describe("helpers", () => {
  it("shortens the month names the way the office sheet writes them", () => {
    expect(shortHijriLabel("04 Zilhaj - 14 Zilhaj")).toBe("04 ZH - 14 ZH");
    expect(shortHijriLabel("28 Zilqad - 04 Zilhaj")).toBe("28 ZQ - 04 ZH");
    expect(shortHijriLabel("23 Zilhaj - 03 Muharram")).toBe("23 ZH - 03 MH");
    expect(shortHijriLabel("01 Rajab - 05 Rajab")).toBe("01 Rajab - 05 Rajab");
  });

  it("reads the category letter", () => {
    expect(categoryCode("Maktab A Category")).toBe("A");
    expect(categoryCode("Maktab D category")).toBe("D");
    expect(categoryCode("Economy")).toBe("Economy");
    expect(categoryCode("")).toBe("");
  });

  it("aligns stored picks to the stays, dropping junk", () => {
    const [p] = passengersFor({ guest: { name: "x", pax: 1 }, stays: [makkah, aziziya], passengers: [{ roomPicks: [3.5 as never] }] });
    expect(p!.roomPicks).toEqual([-1, -1]);
  });
});
