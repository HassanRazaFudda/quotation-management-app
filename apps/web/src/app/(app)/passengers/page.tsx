"use client";

import Link from "next/link";
import { Fragment, useEffect, useState } from "react";
import { ClipboardList, Download, Search } from "lucide-react";

import { passengerIncomplete, type Passenger } from "@junaidi/shared";

import { PageHeader } from "@/components/app-shell";
import { toast } from "@/components/toast";
import { Button, Card, EmptyState, Input, Select, Spinner } from "@/components/ui";
import { api, ApiError } from "@/lib/api";

/** A sheet row as the API sends it (dates arrive as strings). */
interface SheetRow {
  passengerNo: number;
  hbNumber: string;
  guestName: string;
  passenger: Passenger;
  salesStaff: string;
  aziziaRoom: string;
  makkahMadinahRoom: string;
  mina: string;
  days: number;
  category: string;
  ticketStatus: string;
  arrivalDate: string | null;
  departureDate: string | null;
}

interface Sheet {
  season: string;
  seasons: string[];
  staff: string[];
  categories: string[];
  bookings: Array<{ id: string; quotationId: string; rows: SheetRow[] }>;
}

const day = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" }) : "";

const dash = (value: string) => value || <span className="text-gray-300">—</span>;

/**
 * Every passenger of the season's confirmed Hajj bookings, one row each - the
 * office's passenger sheet - with an export to the office's own Excel layout.
 * Details left blank at confirmation show as dashes here and blanks in Excel.
 */
export default function PassengersPage() {
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [season, setSeason] = useState("");
  const [staff, setStaff] = useState("");
  const [category, setCategory] = useState("");
  const [search, setSearch] = useState("");
  const [exporting, setExporting] = useState(false);

  const params = () => {
    const query = new URLSearchParams();
    if (season) query.set("season", season);
    if (staff) query.set("staff", staff);
    if (category) query.set("category", category);
    if (search.trim()) query.set("search", search.trim());
    return query.toString();
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      api
        .get<Sheet>(`/api/passengers?${params()}`)
        .then((result) => {
          setSheet(result);
          if (!season) setSeason(result.season);
        })
        .catch(() => setSheet({ season: "", seasons: [], staff: [], categories: [], bookings: [] }));
    }, 250);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [season, staff, category, search]);

  async function exportExcel() {
    setExporting(true);
    try {
      const blob = await api.file(`/api/passengers/export?${params()}`);
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

  const rows = sheet?.bookings.flatMap((booking) => booking.rows.map((row) => ({ booking, row }))) ?? [];
  const missing = rows.filter(({ row }) => passengerIncomplete(row.passenger)).length;

  return (
    <>
      <PageHeader
        title="Passenger Sheet"
        subtitle="Every passenger on a confirmed Hajj booking"
        action={
          <Button icon={<Download className="size-4" />} loading={exporting} disabled={rows.length === 0} onClick={exportExcel}>
            Export to Excel
          </Button>
        }
      />

      <div className="space-y-5 p-5 lg:p-8">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-60 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-gray-400" />
            <Input
              className="pl-9"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by passenger, passport, guest or HB number"
            />
          </div>
          <Select
            aria-label="Season"
            className="w-44"
            options={(sheet?.seasons ?? []).map((value) => ({ value, label: `Season ${value}` }))}
            value={season}
            onChange={(e) => setSeason(e.target.value)}
          />
          <Select
            aria-label="Staff"
            className="w-44"
            options={[{ value: "", label: "All staff" }, ...(sheet?.staff ?? []).map((value) => ({ value, label: value }))]}
            value={staff}
            onChange={(e) => setStaff(e.target.value)}
          />
          <Select
            aria-label="Category"
            className="w-40"
            options={[
              { value: "", label: "All categories" },
              ...(sheet?.categories ?? []).map((value) => ({ value, label: `Category ${value}` })),
            ]}
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          />
        </div>

        {!sheet ? (
          <Spinner label="Loading…" />
        ) : rows.length === 0 ? (
          <EmptyState
            icon={<ClipboardList className="size-10" />}
            title="No passengers to show"
            hint="Passengers appear here once a Hajj quotation is confirmed with an HB number."
          />
        ) : (
          <>
            <p className="text-sm text-muted">
              {rows.length} passenger{rows.length === 1 ? "" : "s"} on {sheet.bookings.length} booking
              {sheet.bookings.length === 1 ? "" : "s"}
              {missing > 0 && <span className="text-amber-700"> · {missing} with missing details</span>}
            </p>
            <Card className="overflow-x-auto">
              <table className="w-full whitespace-nowrap text-sm">
                <thead className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
                  <tr>
                    {[
                      "S no.",
                      "HB no.",
                      "Surname",
                      "Given name",
                      "Gender",
                      "Passport",
                      "Contact",
                      "Azizia",
                      "Mak / Madina",
                      "Mina",
                      "Category",
                      "Days",
                      "Ticket",
                      "Arrival",
                      "Departure",
                      "Sales staff",
                    ].map((header) => (
                      <th key={header} className="px-3 py-3 font-semibold">
                        {header}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {sheet.bookings.map((booking) => (
                    <Fragment key={booking.id}>
                      {booking.rows.map((row) => {
                        const serial = rows.findIndex((entry) => entry.row === row) + 1;
                        const incomplete = passengerIncomplete(row.passenger);
                        return (
                          <tr key={`${booking.id}-${row.passengerNo}`} className="hover:bg-canvas">
                            <td className="px-3 py-2 text-muted tabular-nums">{serial}</td>
                            <td className="px-3 py-2">
                              <Link href={`/quotations/${booking.id}`} className="font-medium text-ink hover:text-brand-600">
                                {row.hbNumber}
                              </Link>
                              {incomplete && (
                                <span className="ml-2 rounded bg-amber-50 px-1.5 py-0.5 text-[11px] font-medium text-amber-700">
                                  details missing
                                </span>
                              )}
                            </td>
                            <td className="px-3 py-2">{dash(row.passenger.surname)}</td>
                            <td className="px-3 py-2">{dash(row.passenger.givenName)}</td>
                            <td className="px-3 py-2 capitalize">{dash(row.passenger.gender)}</td>
                            <td className="px-3 py-2">{dash(row.passenger.passportNo)}</td>
                            <td className="px-3 py-2">{dash(row.passenger.contact)}</td>
                            <td className="px-3 py-2">{dash(row.aziziaRoom)}</td>
                            <td className="px-3 py-2">{dash(row.makkahMadinahRoom)}</td>
                            <td className="px-3 py-2">{dash(row.mina)}</td>
                            <td className="px-3 py-2">{dash(row.category)}</td>
                            <td className="px-3 py-2 tabular-nums">{row.days || ""}</td>
                            <td className="px-3 py-2">{row.ticketStatus === "WITH TICKET" ? "With" : "Without"}</td>
                            <td className="px-3 py-2">{dash(day(row.arrivalDate))}</td>
                            <td className="px-3 py-2">{dash(day(row.departureDate))}</td>
                            <td className="px-3 py-2">{dash(row.salesStaff)}</td>
                          </tr>
                        );
                      })}
                    </Fragment>
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
