/**
 * The passenger sheet as an .xlsx file, in the office's own layout: the
 * headers of `FORMET HAJJ EXCEL.xlsx`, one row per passenger.
 */

import type { PassengerSheet } from "@junaidi/db";
import { passengerSheetCells, PASSENGER_SHEET_COLUMNS } from "@junaidi/shared";
import ExcelJS from "exceljs";
import { z } from "zod";

export const passengerSheetQuerySchema = z.object({
  season: z.string().trim().max(10).optional(),
  staff: z.string().trim().max(120).optional(),
  category: z.string().trim().max(40).optional(),
  search: z.string().trim().max(120).optional(),
});

/** Columns holding a real date, so Excel can sort and filter them. */
const DATE_COLUMNS = new Set(["BOOKING DATE", "ARRIVAL DATE", "DEPARTURE DATE"]);

export async function passengerWorkbook(sheet: PassengerSheet): Promise<Uint8Array> {
  const workbook = new ExcelJS.Workbook();
  workbook.created = new Date();
  const ws = workbook.addWorksheet("Sheet1", { views: [{ state: "frozen", ySplit: 1 }] });

  ws.addRow([...PASSENGER_SHEET_COLUMNS]);
  ws.getRow(1).font = { bold: true };

  let serial = 0;
  for (const booking of sheet.bookings) {
    for (const row of booking.rows) {
      serial += 1;
      ws.addRow(passengerSheetCells(row, serial));
    }
  }

  PASSENGER_SHEET_COLUMNS.forEach((header, index) => {
    const column = ws.getColumn(index + 1);
    column.width = Math.max(12, header.length + 2);
    if (DATE_COLUMNS.has(header)) column.numFmt = "dd-mmm-yyyy";
    if (header === "PKG AMOUNT") column.numFmt = "#,##0";
  });

  const buffer = await workbook.xlsx.writeBuffer();
  return new Uint8Array(buffer as ArrayBuffer);
}

export function passengerSheetFilename(season: string, today = new Date()): string {
  const day = today.toISOString().slice(0, 10);
  return `Hajj passengers ${season || "all"} ${day}.xlsx`;
}
