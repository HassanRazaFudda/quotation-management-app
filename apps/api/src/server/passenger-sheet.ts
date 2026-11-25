/**
 * The passenger sheet as an .xlsx file, in the office's own layout: the
 * headers of `FORMET HAJJ EXCEL.xlsx`, one row per passenger.
 */

import type { PassengerSheet } from "@junaidi/db";
import { passengerSheetCells, PASSENGER_SHEET_COLUMNS } from "@junaidi/shared";
import ExcelJS from "exceljs";
import { z } from "zod";

const text = (max: number) => z.string().trim().max(max).optional();
const day = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .optional();

const columnFiltersSchema = z.record(z.string().max(40), z.array(z.string().max(200)).max(1000));

/** Every filter is optional; the export takes the same ones, so it holds the filtered rows only. */
export const passengerSheetQuerySchema = z.object({
  season: text(10),
  staff: text(120),
  category: text(40),
  search: text(120),
  haji: text(120),
  hotel: text(160),
  arrivalSector: text(20),
  departureSector: text(20),
  days: z.coerce.number().int().min(0).max(400).optional(),
  mina: text(60),
  from: day,
  to: day,
  /** One column to sort by, "surname:asc" or "arrivalDate:desc". */
  sort: z
    .string()
    .regex(/^[A-Za-z0-9]+:(asc|desc)$/)
    .optional()
    .transform((text) => {
      if (!text) return undefined;
      const [id, direction] = text.split(":") as [string, "asc" | "desc"];
      return { id, direction };
    }),
  /** Excel-style column filters, as JSON: {"makkah1Hotel": ["Hilton"], "mina": ["STANDARD", ""]}. */
  columns: z
    .string()
    .max(20_000)
    .optional()
    .transform((text, ctx) => {
      if (!text) return undefined;
      try {
        return columnFiltersSchema.parse(JSON.parse(text));
      } catch {
        ctx.addIssue({ code: "custom", message: "Column filters are not valid." });
        return z.NEVER;
      }
    }),
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
