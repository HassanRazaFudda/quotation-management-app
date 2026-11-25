"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ClipboardList, Download, Search } from "lucide-react";

import {
  columnChoices,
  filterByColumns,
  filterSheetRows,
  passengerIncomplete,
  SHEET_COLUMNS,
  sortSheetRows,
  type ColumnFilters,
  type SheetRowLike,
  type SheetSort,
} from "@junaidi/shared";

import { PageHeader } from "@/components/app-shell";
import { ColumnFilter } from "@/components/column-filter";
import { toast } from "@/components/toast";
import { Button, Card, EmptyState, Field, Input, Select, Spinner } from "@/components/ui";
import { api, ApiError } from "@/lib/api";

interface Sheet {
  season: string;
  seasons: string[];
  totalPassengers: number;
  bookings: Array<{ id: string; quotationId: string; rows: SheetRowLike[] }>;
}

interface Row {
  bookingId: string;
  row: SheetRowLike;
}

/**
 * Every passenger of the season's confirmed Hajj bookings, one row each - the
 * office's passenger sheet - filtered the way Excel filters: a filter on any
 * column header (search, tick several values, blanks), several columns at once,
 * and a sort. Export downloads exactly the rows shown, in the order shown.
 */
export default function PassengersPage() {
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [season, setSeason] = useState("");
  const [search, setSearch] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [columns, setColumns] = useState<ColumnFilters>({});
  const [sort, setSort] = useState<SheetSort | null>(null);
  const [exporting, setExporting] = useState(false);

  // The whole season once; every filter then runs here, instantly.
  useEffect(() => {
    const query = season ? `?season=${encodeURIComponent(season)}` : "";
    api
      .get<Sheet>(`/api/passengers${query}`)
      .then((result) => {
        setSheet(result);
        if (!season) setSeason(result.season);
      })
      .catch(() => setSheet({ season: "", seasons: [], totalPassengers: 0, bookings: [] }));
  }, [season]);

  const all: Row[] = useMemo(
    () => sheet?.bookings.flatMap((booking) => booking.rows.map((row) => ({ bookingId: booking.id, row }))) ?? [],
    [sheet],
  );

  // Search and the travel period first; the column filters' value lists come from what these leave.
  const base = useMemo(() => {
    const kept = new Set(filterSheetRows(all.map((entry) => entry.row), { search, from: from || undefined, to: to || undefined }));
    return all.filter((entry) => kept.has(entry.row));
  }, [all, search, from, to]);

  const shown = useMemo(() => {
    const filtered = new Set(filterByColumns(base.map((entry) => entry.row), columns));
    const sorted = sortSheetRows(
      base.map((entry) => entry.row).filter((row) => filtered.has(row)),
      sort,
    );
    const owner = new Map(base.map((entry) => [entry.row, entry.bookingId]));
    return sorted.map((row) => ({ row, bookingId: owner.get(row)! }));
  }, [base, columns, sort]);

  const baseRows = useMemo(() => base.map((entry) => entry.row), [base]);
  const filteredCount = Object.keys(columns).length + (search.trim() ? 1 : 0) + (from || to ? 1 : 0);
  const missing = shown.filter(({ row }) => passengerIncomplete(row.passenger)).length;
  const bookings = new Set(shown.map((entry) => entry.bookingId)).size;

  function applyColumn(id: string, selected: string[] | null) {
    setColumns((current) => {
      const next = { ...current };
      if (selected === null) delete next[id];
      else next[id] = selected;
      return next;
    });
  }

  function clearAll() {
    setColumns({});
    setSearch("");
    setFrom("");
    setTo("");
    setSort(null);
  }

  async function exportExcel() {
    setExporting(true);
    try {
      // Sent in the body, not the URL: a column can have hundreds of ticked values.
      const blob = await api.file("/api/passengers/export", {
        season: season || undefined,
        search: search.trim() || undefined,
        from: from || undefined,
        to: to || undefined,
        columns: Object.keys(columns).length > 0 ? columns : undefined,
        sort: sort ? `${sort.id}:${sort.direction}` : undefined,
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `Hajj passengers ${sheet?.season || season} ${new Date().toISOString().slice(0, 10)}.xlsx`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not export the sheet.");
    } finally {
      setExporting(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Passenger Sheet"
        subtitle="Every passenger on a confirmed Hajj booking"
        action={
          <Button icon={<Download className="size-4" />} loading={exporting} disabled={shown.length === 0} onClick={exportExcel}>
            Export to Excel
          </Button>
        }
      />

      <div className="space-y-4 p-5 lg:p-8">
        <Card className="flex flex-wrap items-end gap-3 p-4">
          <div className="relative min-w-60 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-gray-400" />
            <Input
              className="pl-9"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by passenger, passport, guest or HB number"
            />
          </div>
          <Field label="Travelling from">
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-44" />
          </Field>
          <Field label="Travelling to">
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-44" />
          </Field>
          <Field label="Season">
            <Select
              className="w-40"
              options={(sheet?.seasons ?? []).map((value) => ({ value, label: `Season ${value}` }))}
              value={season}
              onChange={(e) => {
                setColumns({});
                setSeason(e.target.value);
              }}
            />
          </Field>
          {(filteredCount > 0 || sort) && (
            <button
              type="button"
              onClick={clearAll}
              className="h-10 px-2 text-sm font-medium text-brand-600 hover:text-brand-700"
            >
              Clear all filters
            </button>
          )}
        </Card>

        {!sheet ? (
          <Spinner label="Loading…" />
        ) : all.length === 0 ? (
          <EmptyState
            icon={<ClipboardList className="size-10" />}
            title="No passengers to show"
            hint="Passengers appear here once a Hajj quotation is confirmed with an HB number."
          />
        ) : (
          <>
            <p className="text-sm text-muted">
              {shown.length} of {all.length} passenger{all.length === 1 ? "" : "s"} · {bookings} booking
              {bookings === 1 ? "" : "s"}
              {filteredCount > 0 && ` · ${filteredCount} filter${filteredCount === 1 ? "" : "s"} on`}
              {missing > 0 && <span className="text-amber-700"> · {missing} with missing details</span>}
              {filteredCount > 0 && <span> · Export downloads these rows only</span>}
            </p>
            <Card className="overflow-x-auto">
              <table className="w-full whitespace-nowrap text-sm">
                <thead className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
                  <tr>
                    <th className="sticky left-0 z-10 bg-white px-3 py-3 font-semibold">S no.</th>
                    {SHEET_COLUMNS.map((column) => (
                      <th
                        key={column.id}
                        className={
                          column.id === "hb" ? "sticky left-14 z-10 border-r border-line bg-white px-3 py-3 font-semibold" : "px-3 py-3 font-semibold"
                        }
                      >
                        <span className={columns[column.id] ? "text-brand-600" : undefined}>{column.header}</span>
                        <ColumnFilter
                          header={column.header}
                          values={columnChoices(baseRows, columns, column.id)}
                          selected={columns[column.id] ?? null}
                          sort={sort?.id === column.id ? sort.direction : null}
                          onApply={(selected) => applyColumn(column.id, selected)}
                          onSort={(direction) => setSort({ id: column.id, direction })}
                        />
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {shown.length === 0 && (
                    <tr>
                      <td colSpan={SHEET_COLUMNS.length + 1} className="px-3 py-10 text-center text-muted">
                        No passengers match these filters.
                      </td>
                    </tr>
                  )}
                  {shown.map(({ row, bookingId }, index) => (
                    <tr key={`${bookingId}-${row.passengerNo}`} className="group hover:bg-canvas">
                      <td className="sticky left-0 z-10 bg-white px-3 py-2 text-muted tabular-nums group-hover:bg-canvas">
                        {index + 1}
                      </td>
                      {SHEET_COLUMNS.map((column) => {
                        // The Mina column shows what the Excel prints ("-" for a tent-mate).
                        const text = column.id === "mina" ? row.mina : column.value(row);
                        if (column.id === "hb") {
                          return (
                            <td key={column.id} className="sticky left-14 z-10 border-r border-line bg-white px-3 py-2 group-hover:bg-canvas">
                              <Link href={`/quotations/${bookingId}`} className="font-medium text-ink hover:text-brand-600">
                                {row.hbNumber}
                              </Link>
                              {passengerIncomplete(row.passenger) && (
                                <span className="ml-2 rounded bg-amber-50 px-1.5 py-0.5 text-[11px] font-medium text-amber-700">
                                  details missing
                                </span>
                              )}
                            </td>
                          );
                        }
                        return (
                          <td key={column.id} className={text ? "px-3 py-2 text-ink" : "px-3 py-2 text-muted"}>
                            {text || "-"}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          </>
        )}
      </div>
    </>
  );
}
