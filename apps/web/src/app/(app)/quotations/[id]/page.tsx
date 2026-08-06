"use client";

import { convertFromPkr, formatMoney, minaCategoryLabel, roomLabel } from "@junaidi/shared";
import Link from "next/link";
import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Copy, Download, Pencil, Plane, Trash2 } from "lucide-react";

import { PageHeader } from "@/components/app-shell";
import { PaymentsCard } from "@/components/payments-card";
import { toast } from "@/components/toast";
import { Badge, Button, Card, Field, Input, Modal, Select, Spinner } from "@/components/ui";
import { cn } from "@/lib/cn";
import { api, ApiError } from "@/lib/api";
import type { Quotation, QuotationFlight, StyledLine } from "@/lib/types";
import { isAdmin, useAuthStore } from "@/stores/auth";

const STATUSES = ["draft", "sent", "confirmed", "expired"] as const;
type Status = (typeof STATUSES)[number];

/**
 * How the room reads on this row. A stay with a mix of rooms - a family split
 * across a Sharing and a Triple - lists each size joined with " + ", the same
 * way the PDF does; a single-room stay just uses its frozen label.
 */
/** Two-digit people count, e.g. 3 -> "03". */
const paxTag = (headcount: number): string =>
  `[${String(Math.max(0, Math.round(headcount))).padStart(2, "0")}]`;

/**
 * How the room reads on this row - the same "Label[NN]" combination the PDF
 * prints. A mix names each room/tier with its pax count joined by " + "
 * ("Triple[03] + Double[02]", "Premium[03] + Without Mina[01]"); a single-room
 * stay just uses its frozen label.
 */
function stayRoomLabel(stay: Quotation["stays"][number]): string {
  const rooms = stay.rooms ?? [];
  if (rooms.length > 1) {
    const isMina = stay.locationType === "mina";
    return rooms
      .map((room) => {
        const label =
          room.roomLabel ||
          (isMina
            ? minaCategoryLabel({
                minaTier: room.minaTier,
                withoutMina: room.withoutMina,
                accommodationName: room.accommodationName,
              })
            : roomLabel(room));
        return label ? `${label} ${paxTag(room.headcount)}` : "";
      })
      .filter(Boolean)
      .join(" + ");
  }
  return stay.roomLabel;
}

/** A Mina stay split across tiers shows its categories bare, with no tent-name prefix. */
const isMinaMix = (stay: Quotation["stays"][number]): boolean =>
  stay.locationType === "mina" && (stay.rooms?.length ?? 0) > 1;

export default function QuotationDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const [q, setQ] = useState<Quotation | null>(null);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [showPrint, setShowPrint] = useState(false);
  const [branding, setBranding] = useState(true);
  const [confirming, setConfirming] = useState(false);
  const [savingStatus, setSavingStatus] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    api
      .get<Quotation>(`/api/quotations/${id}`)
      .then(setQ)
      .catch((err) => toast.error(err instanceof ApiError ? err.message : "Not found."))
      .finally(() => setLoading(false));
  }, [id]);

  async function download() {
    if (!q) return;
    setDownloading(true);
    try {
      const blob = await api.pdf(`/api/quotations/${q._id}/pdf`, { body: { branding } });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${q.quotationId}_${q.guest.name.replace(/\s+/g, "_")}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      setShowPrint(false);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not download.");
    } finally {
      setDownloading(false);
    }
  }

  function duplicate() {
    if (!q) return;
    // Open a fresh quotation pre-filled from this one; it is only created when
    // the staff member saves the form.
    router.push(`/quotations/new?from=${q._id}`);
  }

  async function remove() {
    if (!q) return;
    setDeleting(true);
    try {
      await api.del(`/api/quotations/${q._id}`);
      toast.success(`${q.quotationId} deleted`);
      router.push("/quotations");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not delete.");
      setDeleting(false);
      setConfirmDelete(false);
    }
  }

  /**
   * Confirming needs an HB number (and optionally the assigned staff), so it
   * goes through the dialog - which also reopens on an already-confirmed
   * booking to correct the HB number or staff.
   */
  function pickStatus(status: Status) {
    if (!q) return;
    if (status === "confirmed") {
      setConfirming(true);
      return;
    }
    if (status === q.status) return;
    void changeStatus(status);
  }

  async function changeStatus(
    status: Status,
    extra?: { hbNumber?: string; assignedStaffUserId?: string | null; assignedStaffName?: string },
  ) {
    if (!q) return;
    setSavingStatus(true);
    try {
      const updated = await api.post<Quotation>(`/api/quotations/${q._id}/status`, {
        status,
        ...extra,
      });
      setQ(updated);
      setConfirming(false);
      toast.success(status === "confirmed" ? "Booking confirmed" : `Marked ${status}`);
    } catch (err) {
      // Keep the dialog open on a bad/duplicate HB number so it can be fixed.
      toast.error(err instanceof ApiError ? err.message : "Could not change status.");
    } finally {
      setSavingStatus(false);
    }
  }

  if (loading) return <Spinner label="Loading…" />;
  if (!q) return <div className="p-8 text-muted">Quotation not found.</div>;

  const canEdit = isAdmin(user) || q.createdBy === user?.userId;

  // The totals (finalTotal, subtotal, discount, roundOff) are stored in the
  // quotation's currency; the per-stay and flight figures are PKR and convert.
  // Quotations saved before currencies existed carry none, so default to PKR.
  const currency = q.currency ?? { code: "PKR", symbol: "PKR", decimals: 0 };
  const exchangeRate = q.exchangeRate || 1;
  const money = (value: number) => formatMoney(value, currency);
  const inCurrency = (pkr: number) => convertFromPkr(pkr, exchangeRate);
  const stayAmount = (pkr: number) =>
    inCurrency(pkr).toLocaleString("en-US", {
      minimumFractionDigits: currency.decimals,
      maximumFractionDigits: currency.decimals,
    });

  return (
    <>
      <PageHeader
        title={q.guest.name}
        subtitle={`${q.quotationId} · ${q.createdByName}`}
        action={
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="sm" icon={<Copy className="size-4" />} onClick={duplicate}>
              Duplicate
            </Button>
            {canEdit && (
              <Link href={`/quotations/${q._id}/edit`}>
                <Button variant="secondary" size="sm" icon={<Pencil className="size-4" />}>
                  Edit
                </Button>
              </Link>
            )}
            <Button
              size="sm"
              icon={<Download className="size-4" />}
              onClick={() => {
                setBranding(true);
                setShowPrint(true);
              }}
            >
              PDF
            </Button>
            {canEdit && (
              <Button
                variant="danger"
                size="sm"
                icon={<Trash2 className="size-4" />}
                onClick={() => setConfirmDelete(true)}
              >
                Delete
              </Button>
            )}
          </div>
        }
      />

      <div className="grid gap-5 p-5 lg:grid-cols-3 lg:p-8">
        <div className="space-y-5 lg:col-span-2">
          {/* ---------------- itinerary ---------------- */}
          <Card>
            <div className="border-b border-line px-5 py-4">
              <h2 className="font-semibold text-ink">Itinerary &amp; Accommodation</h2>
            </div>
            <div className="divide-y divide-line">
              {q.stays.map((stay, i) => (
                <div key={i} className="flex items-start justify-between gap-4 px-5 py-3">
                  <div className="min-w-0">
                    <p className="font-medium text-ink">
                      {isMinaMix(stay) ? (
                        // A Mina split reads bare, exactly as it prints:
                        // "Premium[03] + Standard[01] + Without Mina[01]".
                        stayRoomLabel(stay)
                      ) : (
                        <>
                          {stay.accommodationName}
                          {stayRoomLabel(stay) && (
                            <span className="ml-2 text-xs font-normal text-muted">
                              ({stayRoomLabel(stay)})
                            </span>
                          )}
                        </>
                      )}
                      {stay.coversHajj && (
                        <span className="ml-2 rounded bg-brand-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-brand-600">
                          Incl. Hajj days
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-muted">
                      {stay.blockLabelHijri}
                      {stay.blockLabelGregorian && ` · ${stay.blockLabelGregorian}`}
                    </p>
                    {(stay.meal || stay.mealNote) && (
                      <p className="mt-0.5 text-xs text-muted">
                        {stay.meal}
                        {stay.mealNote && ` - ${stay.mealNote}`}
                      </p>
                    )}
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-sm font-semibold text-ink">{stay.nights}n</p>
                    <p className="text-xs text-muted">{stayAmount(stay.lineTotal)}</p>
                  </div>
                </div>
              ))}
            </div>
          </Card>

          {/* ---------------- flights ---------------- */}
          <Card>
            <div className="flex items-center gap-2 border-b border-line px-5 py-4">
              <Plane className="size-4 text-brand-500" />
              <h2 className="font-semibold text-ink">Air Travel</h2>
            </div>
            <div className="px-5 py-4">
              {q.flight?.included ? (
                <div className="space-y-2 text-sm">
                  <FlightLeg label="Departure" leg={q.flight.outbound} />
                  {q.flight.inbound ? (
                    <FlightLeg label="Return" leg={q.flight.inbound} />
                  ) : (
                    <p className="text-muted">Return: one-way ticket only</p>
                  )}
                  <p className="pt-1 text-xs text-muted">
                    Air fare included in the total - {money(inCurrency(q.flight.total))} per person
                  </p>
                </div>
              ) : (
                <p className="text-sm text-muted">
                  Flight is not part of this package - the guest arranges their own travel.
                </p>
              )}
            </div>
          </Card>

          {/* ---------------- payments (confirmed bookings only) ---------------- */}
          {q.status === "confirmed" && <PaymentsCard quotation={q} onUpdated={setQ} />}

          {/* ---------------- services & terms ---------------- */}
          {(q.minaServices.length > 0 || q.arafatServices.length > 0) && (
            <div className="grid gap-5 sm:grid-cols-2">
              <ListCard title="Extra Services in Mina" items={q.minaServices} />
              <ListCard title="Extra Services in Arafat" items={q.arafatServices} />
            </div>
          )}

          <div className="grid gap-5 sm:grid-cols-3">
            <ListCard
              title="Price Includes"
              items={q.qurbaniIncluded ? [...q.includes, { text: "Qurbani." }] : q.includes}
              note={q.includesNote}
            />
            <ListCard title="Visa Requirements" items={q.requirements} />
            <ListCard title="Terms &amp; Taxes" items={q.terms} />
          </div>

          {q.remarks && (
            <Card className="p-5">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted">Remarks</p>
              <p className="mt-1 whitespace-pre-line text-sm text-ink">{q.remarks}</p>
            </Card>
          )}
        </div>

        {/* ---------------- summary ---------------- */}
        <div className="space-y-5">
          <Card className="p-5">
            <p className="text-xs font-semibold text-muted">TOTAL PER PERSON</p>
            <p className="text-3xl font-bold text-brand-600">{money(q.finalTotal)}</p>
            <p className="mt-1 text-sm text-muted">
              {q.totalNights} nights
              {q.flight?.included
                ? ` · incl. ${money(inCurrency(q.flight.total))} air fare`
                : " · flight not included"}
            </p>

            {/* Discount and round-off are admin-visible only, never on the PDF. */}
            {isAdmin(user) && (q.discount > 0 || q.roundOff !== 0) && (
              <div className="mt-3 space-y-1.5 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
                {q.discount > 0 && (
                  <p>
                    Internal: {money(q.discount)} discount applied
                    {q.discountNote && ` - ${q.discountNote}`}
                    <br />
                    Subtotal was {money(q.subtotal)}
                  </p>
                )}
                {q.roundOff !== 0 && (
                  <p>
                    Rounded {q.roundOff > 0 ? "up" : "down"} by{" "}
                    {money(Math.abs(q.roundOff))} (net was{" "}
                    {money(q.subtotal - q.discount)})
                  </p>
                )}
              </div>
            )}

            <div className="mt-4">
              <p className="mb-2 text-sm text-muted">Status</p>
              <div className="flex flex-wrap gap-1.5">
                {STATUSES.map((status) => {
                  const active = q.status === status;
                  return (
                    <button
                      key={status}
                      type="button"
                      disabled={savingStatus || !canEdit}
                      onClick={() => pickStatus(status)}
                      className={cn(
                        "rounded-lg border px-3 py-1 text-xs font-medium capitalize transition-colors",
                        "disabled:cursor-not-allowed disabled:opacity-60",
                        active
                          ? "border-brand-500 bg-brand-500 text-white"
                          : "border-line bg-white text-muted hover:border-gray-300 hover:text-ink",
                      )}
                    >
                      {status}
                    </button>
                  );
                })}
              </div>
              {q.status === "confirmed" && q.hbNumber && (
                <div className="mt-2 space-y-1 text-sm">
                  <p>
                    <span className="text-muted">HB Number: </span>
                    <span className="font-semibold text-ink">{q.hbNumber}</span>
                  </p>
                  <p>
                    <span className="text-muted">Assigned staff: </span>
                    <span className="font-semibold text-ink">{q.assignedStaff?.name || "—"}</span>
                  </p>
                  {canEdit && (
                    <button
                      type="button"
                      onClick={() => setConfirming(true)}
                      className="text-xs font-medium text-brand-600 hover:text-brand-700"
                    >
                      Edit HB / assigned staff
                    </button>
                  )}
                </div>
              )}
            </div>
          </Card>

          <Card className="p-5 text-sm">
            <dl className="space-y-2">
              <Row label="Quotation ID" value={q.quotationId} />
              {q.hbNumber && <Row label="HB Number" value={q.hbNumber} />}
              {q.assignedStaff?.name && <Row label="Assigned staff" value={q.assignedStaff.name} />}
              <Row label="Guest" value={q.guest.name} />
              <Row label="PAX" value={String(q.guest.pax)} />
              {q.packageCategory && <Row label="Category" value={q.packageCategory} />}
              <Row label="Qurbani" value={q.qurbaniIncluded ? "Included" : "Not included"} />
              <Row label="Mina" value={q.withoutMina ? "Without Mina" : "Included"} />
              <Row label="Date" value={new Date(q.date).toLocaleDateString("en-GB")} />
              {q.validUntil && (
                <Row label="Valid until" value={new Date(q.validUntil).toLocaleDateString("en-GB")} />
              )}
              <Row label="Created by" value={q.createdByName || "-"} />
            </dl>
          </Card>

          <Card className="p-5">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">Package</p>
            <p className="mt-1 text-sm font-medium text-ink">{q.packageTitle || "-"}</p>
          </Card>
        </div>
      </div>

      <ConfirmDialog
        open={confirming}
        saving={savingStatus}
        initialHb={q.hbNumber}
        initialStaff={q.assignedStaff}
        onCancel={() => setConfirming(false)}
        onConfirm={(payload) => changeStatus("confirmed", payload)}
      />

      <Modal open={showPrint} onClose={() => setShowPrint(false)} title="Print quotation">
        <p className="text-sm text-muted">Download this quotation as a PDF.</p>
        <label className="mt-4 flex items-center gap-2 text-sm font-medium text-ink">
          <input
            type="checkbox"
            checked={branding}
            onChange={(e) => setBranding(e.target.checked)}
            className="size-4 accent-brand-500"
          />
          Include Junaidi branding
        </label>
        {!branding && (
          <p className="mt-1 text-xs text-muted">
            The PDF prints with no logo, letterhead or agency signature - a neutral copy.
          </p>
        )}
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" size="sm" onClick={() => setShowPrint(false)}>
            Cancel
          </Button>
          <Button
            size="sm"
            icon={<Download className="size-4" />}
            loading={downloading}
            onClick={download}
          >
            Download PDF
          </Button>
        </div>
      </Modal>

      <Modal open={confirmDelete} onClose={() => setConfirmDelete(false)} title="Delete quotation">
        <p className="text-sm text-muted">
          Delete <strong className="text-ink">{q.quotationId}</strong> for {q.guest.name}? This
          cannot be undone.
          {q.status === "confirmed" && (
            <span className="mt-2 block text-brand-600">
              This booking is confirmed (HB {q.hbNumber}); deleting it frees that HB number.
            </span>
          )}
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" size="sm" onClick={() => setConfirmDelete(false)}>
            Cancel
          </Button>
          <Button variant="danger" size="sm" loading={deleting} onClick={remove}>
            Delete
          </Button>
        </div>
      </Modal>
    </>
  );
}

/**
 * Confirming a booking asks for its HB number. It is required, and the server
 * rejects one already used elsewhere - that error surfaces as a toast while
 * this dialog stays open so the number can be corrected.
 */
const OTHER_STAFF = "__other__";

function ConfirmDialog({
  open,
  saving,
  initialHb,
  initialStaff,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  saving: boolean;
  initialHb: string;
  initialStaff?: { userId: string | null; name: string };
  onCancel: () => void;
  onConfirm: (payload: {
    hbNumber: string;
    assignedStaffUserId: string | null;
    assignedStaffName: string;
  }) => void;
}) {
  const [hb, setHb] = useState(initialHb);
  const [staff, setStaff] = useState<Array<{ id: string; name: string }>>([]);
  const [staffChoice, setStaffChoice] = useState("");
  const [otherName, setOtherName] = useState("");

  useEffect(() => {
    api
      .get<{ users: Array<{ id: string; name: string }> }>("/api/users/basic")
      .then((r) => setStaff(r.users))
      .catch(() => undefined);
  }, []);

  // Reset the fields each time the dialog opens, seeding the assigned staff.
  useEffect(() => {
    if (!open) return;
    setHb(initialHb);
    if (initialStaff?.userId) {
      setStaffChoice(initialStaff.userId);
      setOtherName("");
    } else if (initialStaff?.name) {
      setStaffChoice(OTHER_STAFF);
      setOtherName(initialStaff.name);
    } else {
      setStaffChoice("");
      setOtherName("");
    }
  }, [open, initialHb, initialStaff]);

  const trimmed = hb.trim();

  return (
    <Modal open={open} onClose={onCancel} title="Confirm booking">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (!trimmed) return;
          onConfirm({
            hbNumber: trimmed,
            assignedStaffUserId: staffChoice && staffChoice !== OTHER_STAFF ? staffChoice : null,
            assignedStaffName: staffChoice === OTHER_STAFF ? otherName.trim() : "",
          });
        }}
        className="space-y-4"
      >
        <p className="text-sm text-muted">
          Enter the HB number for this booking. It must be unique - the same
          number cannot be used on another booking.
        </p>
        <Field label="HB Number">
          <Input
            value={hb}
            onChange={(e) => setHb(e.target.value)}
            placeholder="HB-1448-0001"
            autoFocus
            required
          />
        </Field>
        <Field label="Assigned staff (optional)">
          <Select
            options={[
              { value: "", label: "— none —" },
              ...staff.map((s) => ({ value: s.id, label: s.name })),
              { value: OTHER_STAFF, label: "Other (type a name)" },
            ]}
            value={staffChoice}
            onChange={(e) => setStaffChoice(e.target.value)}
          />
        </Field>
        {staffChoice === OTHER_STAFF && (
          <Input
            value={otherName}
            onChange={(e) => setOtherName(e.target.value)}
            placeholder="Staff name"
          />
        )}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onCancel} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" loading={saving} disabled={!trimmed}>
            Confirm booking
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function FlightLeg({
  label,
  leg,
}: {
  label: string;
  leg: QuotationFlight["outbound"];
}) {
  if (!leg) return null;
  return (
    <p className="text-ink">
      <span className="text-muted">{label}: </span>
      {leg.origin} → {leg.destination}
      {leg.airline && <span className="text-muted"> ({leg.airline})</span>}
    </p>
  );
}

function ListCard({ title, items, note }: { title: string; items: StyledLine[]; note?: string }) {
  return (
    <Card className="p-5">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">{title}</p>
      {items.length > 0 ? (
        <ul className="list-disc space-y-1 pl-4 text-sm text-ink">
          {items.map((item, i) => (
            <li
              key={i}
              style={{
                color: /^#[0-9a-fA-F]{3,8}$/.test(item.color ?? "") ? item.color : undefined,
                fontWeight: item.bold ? 600 : undefined,
              }}
            >
              {item.text}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted">-</p>
      )}
      {note && <p className="mt-2 text-xs font-medium text-brand-600">{note}</p>}
    </Card>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-muted">{label}</dt>
      <dd className="text-right font-medium text-ink">{value}</dd>
    </div>
  );
}
