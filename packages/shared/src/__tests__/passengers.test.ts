import { describe, expect, it } from "vitest";

import {
  categoryCode,
  passengerSheetCells,
  passengerSheetRows,
  passengersFor,
  PASSENGER_SHEET_COLUMNS,
  shortHijriLabel,
  validateRoomPicks,
  filterSheetRows,
  sheetFilterOptions,
  SHEET_NONE,
  SHEET_COLUMNS,
  columnChoices,
  filterByColumns,
  sortSheetRows,
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
    for (const blank of ["REMARKS", "SPECIAL SERVICES", "TRAIN", "FLIGHT NO", "IST INT"]) {
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

describe("filtering the sheet", () => {
  // Booking 1: 5 pax, JED in, MED out, 25 days, Mina split Standard/Deluxe.
  const one = passengerSheetRows(
    booking({
      passengers: [
        { surname: "AHMED", givenName: "MUHAMMAD", passportNo: "AZ1", roomPicks: [0, 0, -1, -1] },
        { surname: "AHMED", givenName: "AYESHA", roomPicks: [0, 0, -1, -1] },
        { surname: "KHAN", givenName: "BILAL", roomPicks: [1, 1, -1, -1] },
        { roomPicks: [1, 1, -1, -1] },
        { roomPicks: [1, -1, -1, -1] },
      ],
    }),
  );
  // Booking 2: 2 pax, no ticket, 10 days, Makkah only at Hilton, category C.
  const two = passengerSheetRows(
    booking({
      hbNumber: "HB-900",
      guest: { name: "Other Family", pax: 2 },
      packageCategory: "Maktab C Category",
      assignedStaff: { name: "Hafiz Sahab" },
      totalNights: 9,
      flight: { included: false },
      stays: [{ ...makkah, accommodationName: "Hilton", blockStartGregorian: "2027-06-10", blockEndGregorian: "2027-06-19" }],
      passengers: [{ surname: "RAZA", givenName: "HASSAN" }],
    }),
  );
  const rows = [...one, ...two];
  const count = (filter: Parameters<typeof filterSheetRows>[1]) => filterSheetRows(rows, filter).length;

  it("lets every filter through when none is set", () => {
    expect(count({})).toBe(7);
  });

  it("filters by hotel, category, staff and days", () => {
    expect(count({ hotel: "Hilton" })).toBe(2);
    expect(count({ hotel: "Swiss Al Maqam" })).toBe(5);
    expect(count({ category: "C" })).toBe(2);
    expect(count({ staff: "Kamran Baig" })).toBe(5);
    expect(count({ days: 10 })).toBe(2);
    expect(count({ days: 25 })).toBe(5);
  });

  it("filters by the passenger's name, and searches name, passport and HB", () => {
    expect(count({ haji: "ahmed" })).toBe(2);
    expect(count({ haji: "bilal" })).toBe(1);
    expect(count({ search: "AZ1" })).toBe(1);
    expect(count({ search: "HB-900" })).toBe(2);
  });

  it("filters by arrival and departure sector, or by no ticket", () => {
    expect(count({ arrivalSector: "JED" })).toBe(5);
    expect(count({ departureSector: "med" })).toBe(5);
    expect(count({ arrivalSector: SHEET_NONE })).toBe(2);
  });

  it("filters by the passenger's own Mina tier, not the printed '-'", () => {
    expect(one.map((row) => row.mina)).toEqual(["STANDARD", "-", "DELUXE", "-", ""]);
    expect(count({ mina: "STANDARD" })).toBe(2);
    expect(count({ mina: "DELUXE" })).toBe(2);
    // Unassigned in booking 1, and booking 2 has no Mina at all.
    expect(count({ mina: SHEET_NONE })).toBe(3);
  });

  it("keeps passengers whose trip overlaps the period", () => {
    // Booking 1 travels 10 May - 3 June 2027; booking 2 travels 10-19 June.
    expect(count({ from: "2027-05-15", to: "2027-05-20" })).toBe(5);
    expect(count({ from: "2027-06-01", to: "2027-06-12" })).toBe(7);
    expect(count({ from: "2027-06-15" })).toBe(2);
    expect(count({ to: "2027-05-09" })).toBe(0);
  });

  it("applies several filters at once", () => {
    expect(count({ hotel: "Swiss Al Maqam", mina: "STANDARD", haji: "ahmed" })).toBe(2);
    expect(count({ hotel: "Swiss Al Maqam", mina: "DELUXE", haji: "ahmed" })).toBe(0);
  });

  it("offers each filter's choices from all the rows", () => {
    const options = sheetFilterOptions(rows);
    expect(options.hotels).toEqual(["Diar Al Mashaer", "Hilton", "Sofitel", "Swiss Al Maqam"]);
    expect(options.arrivalSectors).toEqual(["JED"]);
    expect(options.days).toEqual([10, 25]);
    expect(options.minaTiers).toEqual(["DELUXE", "STANDARD"]);
    expect(options.categories).toEqual(["A", "C"]);
  });
});

describe("Excel-style column filters", () => {
  const rows = [
    ...passengerSheetRows(
      booking({
        passengers: [
          { surname: "AHMED", roomPicks: [0, 0, -1, -1] },
          { surname: "KHAN", roomPicks: [1, 1, -1, -1] },
        ],
        guest: { name: "x", pax: 2 },
      }),
    ),
    ...passengerSheetRows(
      booking({
        hbNumber: "HB-900",
        guest: { name: "y", pax: 1 },
        stays: [{ ...makkah, accommodationName: "Hilton" }],
        passengers: [{ surname: "RAZA" }],
      }),
    ),
  ];

  it("keeps rows matching any ticked value in a column", () => {
    expect(filterByColumns(rows, { surname: ["AHMED", "RAZA"] }).map((r) => r.passenger.surname)).toEqual(["AHMED", "RAZA"]);
  });

  it("applies several columns at once", () => {
    expect(filterByColumns(rows, { makkah1Hotel: ["Swiss Al Maqam"], mina: ["STANDARD"] }).map((r) => r.passenger.surname)).toEqual([
      "AHMED",
    ]);
  });

  it("treats '' as the blanks of a column", () => {
    expect(filterByColumns(rows, { mina: [""] }).map((r) => r.passenger.surname)).toEqual(["RAZA"]);
  });

  it("ignores unknown columns, and an empty set of filters keeps every row", () => {
    expect(filterByColumns(rows, {})).toHaveLength(3);
    expect(filterByColumns(rows, { nope: ["x"] })).toHaveLength(3);
  });

  it("lists a column's values from what the other filters leave, blanks last", () => {
    expect(columnChoices(rows, {}, "makkah1Hotel")).toEqual(["Hilton", "Swiss Al Maqam"]);
    expect(columnChoices(rows, { surname: ["RAZA"] }, "makkah1Hotel")).toEqual(["Hilton"]);
    // Its own filter does not narrow its own list.
    expect(columnChoices(rows, { makkah1Hotel: ["Hilton"] }, "makkah1Hotel")).toEqual(["Hilton", "Swiss Al Maqam"]);
    expect(columnChoices(rows, {}, "mina")).toEqual(["DELUXE", "STANDARD", ""]);
  });

  it("formats dates the same whether they are Dates or JSON strings", () => {
    const column = SHEET_COLUMNS.find((c) => c.id === "arrivalDate")!;
    const json = JSON.parse(JSON.stringify(rows[0]));
    expect(column.value(rows[0]!)).toBe("10 May 2027");
    expect(column.value(json)).toBe("10 May 2027");
  });
});

describe("sorting the sheet", () => {
  const rows = [
    ...passengerSheetRows(booking({ hbNumber: "HB-2", guest: { name: "x", pax: 1 }, passengers: [{ surname: "KHAN" }] })),
    ...passengerSheetRows(
      booking({
        hbNumber: "HB-10",
        guest: { name: "y", pax: 1 },
        stays: [{ ...makkah, blockStartGregorian: "2027-04-01", blockEndGregorian: "2027-04-20" }],
        finalTotal: 900_000,
        passengers: [{ surname: "AHMED" }],
      }),
    ),
    ...passengerSheetRows(booking({ hbNumber: "HB-3", guest: { name: "z", pax: 1 }, passengers: [{}] })),
  ];
  const by = (id: string, direction: "asc" | "desc" = "asc") => sortSheetRows(rows, { id, direction });

  it("sorts text A to Z and back, blanks last both ways", () => {
    expect(by("surname").map((r) => r.passenger.surname)).toEqual(["AHMED", "KHAN", ""]);
    expect(by("surname", "desc").map((r) => r.passenger.surname)).toEqual(["KHAN", "AHMED", ""]);
  });

  it("sorts numbers inside text the way people read them", () => {
    expect(by("hb").map((r) => r.hbNumber)).toEqual(["HB-2", "HB-3", "HB-10"]);
  });

  it("sorts dates and amounts by value, not by their text", () => {
    expect(by("arrivalDate").map((r) => r.hbNumber)[0]).toBe("HB-10"); // 01 Apr before 10 May
    expect(by("amount", "desc").map((r) => r.hbNumber)[0]).toBe("HB-2"); // 2,000,000 above 900,000
  });

  it("leaves the order alone with no sort", () => {
    expect(sortSheetRows(rows, null)).toEqual(rows);
  });
});

describe("filtering rows that came over JSON", () => {
  it("reads string dates for the travel period, as the browser has them", () => {
    const rows = passengerSheetRows(booking({ guest: { name: "x", pax: 2 } }));
    const json = JSON.parse(JSON.stringify(rows));
    expect(filterSheetRows(json, { from: "2027-05-15", to: "2027-05-20" })).toHaveLength(2);
    expect(filterSheetRows(json, { to: "2027-05-09" })).toHaveLength(0);
  });
});

describe("C/O", () => {
  it("prints who the booking came through in the CO column, and offers it as a column filter", () => {
    const rows = passengerSheetRows(booking({ careOf: { name: "FAISAL NATHANI" }, guest: { name: "x", pax: 2 } }));
    expect(rows.map((row) => row.careOf)).toEqual(["FAISAL NATHANI", "FAISAL NATHANI"]);
    const cells = passengerSheetCells(rows[0]!, 1);
    expect(cells[PASSENGER_SHEET_COLUMNS.indexOf("CO" as never)]).toBe("FAISAL NATHANI");
    expect(SHEET_COLUMNS.map((c) => c.id).indexOf("careOf")).toBe(SHEET_COLUMNS.map((c) => c.id).indexOf("staff") - 1);
    expect(filterByColumns(rows, { careOf: ["FAISAL NATHANI"] })).toHaveLength(2);
  });

  it("leaves CO blank when nobody is named", () => {
    const [row] = passengerSheetRows(booking({ guest: { name: "x", pax: 1 } }));
    expect(row!.careOf).toBe("");
  });
});
