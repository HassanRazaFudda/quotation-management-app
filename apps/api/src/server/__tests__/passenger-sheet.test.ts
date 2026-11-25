/**
 * The exported file must open as the office's own sheet: the same 49 headers,
 * in the same order, one row per passenger.
 */

import { filterSheetRows, passengerSheetRows, sheetFilterOptions, type SheetBooking } from "@junaidi/shared";
import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";

import { passengerSheetFilename, passengerSheetQuerySchema, passengerWorkbook } from "../passenger-sheet";

/** The header row of C:\Code\Junaidi\FORMET HAJJ EXCEL.xlsx, exactly. */
const OFFICE_HEADERS = [
  "S NO.", "HB NO.", "BOOKING DATE", "PRE REG NO ", "REG EMAIL ID", "REMARKS", "BOOKING STATUS", "CONT",
  "SUR NAME", "GIVING NAME", "CO", "SALES STAFF", "AZIZIA", "MAK/MADINA", "MINA", "SPECIAL SERVICES",
  "GENDER", "PASSPORT NO.", "DAYS", "CATEGORY", "PKG AMOUNT", "TRAIN", "TKT STATUS", "ARRIVAL DATE",
  "FLIGHT NO", "SECTOR", "ARRIVAL TIME", "DEPARTURE DATE", "DEPARTURE FLIGHT #", "SECTOR", "DEPARTURE TIME",
  "MAKKAH 1ST SESSION", "HOTEL", "MAKKAH 2ND SESSION", "HOTEL", "AZIZIA SECTION", "HOTEL",
  "AZIZIA 2ND SECTION", "HOTEL", "AZIZIA 3RD SECTION", "HOTEL", "MADINA 1ST SESSION", "MADINA HOTEL",
  "MADINA 2ND SESSION", "MADINA HOTEL", "IST INT", "DATE", "2ND", "DATE",
];

const booking: SheetBooking = {
  hbNumber: "HB-002039",
  date: "2026-07-20",
  guest: { name: "Faisal Nathani", pax: 2 },
  assignedStaff: { name: "Hafiz Sahab" },
  packageCategory: "Maktab C Category",
  totalNights: 19,
  finalTotal: 1_975_000,
  flight: { included: true, outbound: { destination: "JED" }, inbound: { origin: "MED" } },
  stays: [
    {
      locationType: "makkah",
      blockLabelHijri: "14 ZH - 17 ZH",
      blockStartGregorian: "2027-05-08",
      blockEndGregorian: "2027-05-11",
      accommodationName: "Rotana Jabal E Omer",
      occupancy: "DBL",
    },
  ],
  passengers: [{ surname: "AHMED", givenName: "MUHAMMAD", gender: "male" }],
};

async function readBack(bytes: Uint8Array) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(Buffer.from(bytes) as never);
  return workbook.worksheets[0]!;
}

const cellValues = (row: ExcelJS.Row, count: number) =>
  Array.from({ length: count }, (_, index) => row.getCell(index + 1).value);

describe("the passenger sheet export", () => {
  const sheet = {
    season: "1448",
    seasons: ["1448"],
    ...sheetFilterOptions([]),
    totalPassengers: 2,
    bookings: [{ id: "x", quotationId: "HQ-1448-0001", rows: passengerSheetRows(booking) }],
  };

  it("has the office file's 49 headers, in order", async () => {
    const ws = await readBack(await passengerWorkbook(sheet));
    expect(cellValues(ws.getRow(1), 49)).toEqual(OFFICE_HEADERS);
    expect(ws.getRow(1).getCell(50).value).toBeNull();
  });

  it("writes one row per passenger, numbered, with real dates and amounts", async () => {
    const ws = await readBack(await passengerWorkbook(sheet));
    expect(ws.rowCount).toBe(3); // header + 2 pax
    const [first, second] = [ws.getRow(2), ws.getRow(3)];
    const at = (row: ExcelJS.Row, header: string) => row.getCell(OFFICE_HEADERS.indexOf(header) + 1).value;

    expect(at(first, "S NO.")).toBe(1);
    expect(at(second, "S NO.")).toBe(2);
    expect(at(first, "SUR NAME")).toBe("AHMED");
    expect(at(second, "SUR NAME")).toBe(""); // not entered: blank
    expect(at(first, "MAK/MADINA")).toBe("DBL");
    expect(at(second, "MAK/MADINA")).toBe("-");
    expect(at(first, "PKG AMOUNT")).toBe(1_975_000);
    expect(at(first, "BOOKING DATE")).toBeInstanceOf(Date);
    expect(at(first, "ARRIVAL DATE")).toBeInstanceOf(Date);
    expect(at(first, "TKT STATUS")).toBe("WITH TICKET");
    expect(at(first, "CATEGORY")).toBe("C");
  });

  it("exports only the filtered rows, numbered from 1", async () => {
    const rows = filterSheetRows(passengerSheetRows(booking), { haji: "muhammad" });
    const ws = await readBack(await passengerWorkbook({ ...sheet, bookings: [{ id: "x", quotationId: "HQ-1448-0001", rows }] }));
    expect(ws.rowCount).toBe(2); // header + the one match
    expect(ws.getRow(2).getCell(1).value).toBe(1);
    expect(ws.getRow(2).getCell(OFFICE_HEADERS.indexOf("GIVING NAME") + 1).value).toBe("MUHAMMAD");
  });

  it("reads Excel-style column filters and a sort from the query", () => {
    const parsed = passengerSheetQuerySchema.parse({
      columns: JSON.stringify({ makkah1Hotel: ["Hilton", "Swissotel"], mina: [""] }),
      sort: "arrivalDate:desc",
      from: "2027-05-01",
    });
    expect(parsed.columns).toEqual({ makkah1Hotel: ["Hilton", "Swissotel"], mina: [""] });
    expect(parsed.sort).toEqual({ id: "arrivalDate", direction: "desc" });
    expect(() => passengerSheetQuerySchema.parse({ columns: "not json" })).toThrow();
    expect(() => passengerSheetQuerySchema.parse({ sort: "x:sideways" })).toThrow();
  });

  it("names the file after the season and the day", () => {
    expect(passengerSheetFilename("1448", new Date("2026-11-25T10:00:00Z"))).toBe("Hajj passengers 1448 2026-11-25.xlsx");
  });
});
