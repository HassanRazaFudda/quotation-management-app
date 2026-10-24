"use client";

import { formatGregorianRange, formatMoney } from "@junaidi/shared";
import Link from "next/link";
import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Bus, Copy, Download, Pencil, Plane, Trash2 } from "lucide-react";

import { PageHeader } from "@/components/app-shell";
import { PaymentsCard } from "@/components/payments-card";
import { toast } from "@/components/toast";
import { Badge, Button, Card, Field, Input, Modal, Select, Spinner } from "@/components/ui";
import { cn } from "@/lib/cn";
import { api, ApiError } from "@/lib/api";
import type { StyledLine } from "@/lib/types";
import type { UmrahQuotation, UmrahStayDoc } from "@/lib/umrah-types";
import { isAdmin, useAuthStore } from "@/stores/auth";

const STATUSES = ["draft", "sent", "confirmed", "expired"] as const;
type Status = (typeof STATUSES)[number];

const BASIS_LABEL = { perPerson: "per person", perInfant: "per infant", perGroup: "whole group" } as const;

/** "1x Quad @ SAR 300 / room / night", or one rate per room type for a room-types quote. */
function rateLines(stay: UmrahStayDoc, tiered: boolean): string[] {
  const unit = stay.rateBasis === "room" ? "room" : "person";
  if (tiered) {
    const offered = (["Quad", "Triple", "Double"] as const)
      .filter((tier) => stay.tierRates[tier] !== null)
      .map((tier) => `${tier} ${stay.tierRates[tier]!.toLocaleString("en-US")}`);
    return offered.length > 0 ? [`${offered.join(" · ")} (${stay.currencyCode} per ${unit} / night)`] : [];
  }
  return stay.rooms.map((room) => {
    const count = stay.rateBasis === "room" ? `${room.rooms}x ` : "";
    return `${count}${room.roomType} @ ${stay.currencyCode} ${room.rate.toLocaleString("en-US")} / ${unit} / night`;
  });
}

export default function UmrahQuotationDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const [q, setQ] = useState<UmrahQuotation | null>(null);
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
      .get<UmrahQuotation>(`/api/umrah-quotations/${id}`)
      .then(setQ)
      .catch((err) => toast.error(err instanceof ApiError ? err.message : "Not found."))
      .finally(() => setLoading(false));
  }, [id]);

  async function download() {
    if (!q) return;
    setDownloading(true);
    try {
      const blob = await api.pdf(`/api/umrah-quotations/${q._id}/pdf`, { body: { branding } });
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

  async function remove() {
    if (!q) return;
    setDeleting(true);
    try {
      await api.del(`/api/umrah-quotations/${q._id}`);
      toast.success(`${q.quotationId} deleted`);
      router.push("/umrah-quotations");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not delete.");
      setDeleting(false);
      setConfirmDelete(false);
    }
  }

  function pickStatus(status: Status) {
    if (!q || status === q.status) return;
    if (status === "confirmed") {
      if (q.pricingMode === "tiered") {
        toast.error("Switch this quotation to One room type or Family before confirming it.");
        return;
      }
      setConfirming(true);
      return;
    }
    void changeStatus(status);
  }

  async function changeStatus(
    status: Status,
    extra?: { bookingRef?: string; assignedStaffUserId?: string | null; assignedStaffName?: string },
  ) {
    if (!q) return;
    setSavingStatus(true);
    try {
      const updated = await api.post<UmrahQuotation>(`/api/umrah-quotations/${q._id}/status`, { status, ...extra });
      setQ(updated);
      setConfirming(false);
      toast.success(status === "confirmed" ? "Booking confirmed" : `Marked ${status}`);
    } catch (err) {
      // Keep the dialog open on a bad or duplicate booking number so it can be fixed.
      toast.error(err instanceof ApiError ? err.message : "Could not change status.");
    } finally {
      setSavingStatus(false);
    }
  }

  if (loading) return <Spinner label="Loading…" />;
  if (!q) return <div className="p-8 text-muted">Quotation not found.</div>;

  const canEdit = isAdmin(user) || q.createdBy === user?.userId;
  const money = (value: number) => formatMoney(value, q.currency);
  const tiered = q.pricingMode === "tiered";
  const discounted = q.priceLines.filter((line) => line.discount > 0 || line.roundOff !== 0);
  const party = [
    `${q.guest.pax} with a bed`,
    q.guest.withoutBedPax > 0 ? `${q.guest.withoutBedPax} without a bed` : "",
    q.guest.infants > 0 ? `${q.guest.infants} infant${q.guest.infants === 1 ? "" : "s"}` : "",
  ].filter(Boolean);

  return (
    <>
      <PageHeader
        title={q.guest.name}
        subtitle={`${q.quotationId} · ${q.createdByName}`}
        action={
          <div className="flex items-center gap-2">
            <Link href={`/umrah-quotations/new?from=${q._id}`}>
              <Button variant="secondary" size="sm" icon={<Copy className="size-4" />}>
                Duplicate
              </Button>
            </Link>
            {canEdit && (
              <Link href={`/umrah-quotations/${q._id}/edit`}>
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
              <Button variant="danger" size="sm" icon={<Trash2 className="size-4" />} onClick={() => setConfirmDelete(true)}>
                Delete
              </Button>
            )}
          </div>
        }
      />

      <div className="grid gap-5 p-5 lg:grid-cols-3 lg:p-8">
        <div className="space-y-5 lg:col-span-2">
          {/* ---------------- hotels ---------------- */}
          <Card>
            <div className="border-b border-line px-5 py-4">
              <h2 className="font-semibold text-ink">Hotels</h2>
            </div>
            <div className="divide-y divide-line">
              {q.stays.map((stay, i) => (
                <div key={i} className="flex items-start justify-between gap-4 px-5 py-3">
                  <div className="min-w-0">
                    <p className="font-medium text-ink">
                      {stay.hotelName}
                      <span className="ml-2 text-xs font-normal text-muted">{stay.city}</span>
                      {stay.distance && <span className="ml-2 text-xs font-normal text-muted">· {stay.distance}</span>}
                    </p>
                    <p className="text-xs text-muted">
                      {formatGregorianRange(stay.checkIn, stay.checkOut)}
                      {stay.meal && ` · ${stay.meal}`}
                    </p>
                    {rateLines(stay, tiered).map((line, n) => (
                      <p key={n} className="mt-0.5 text-xs text-muted">
                        {line}
                      </p>
                    ))}
                    {q.guest.withoutBedPax > 0 && (
                      <p className="mt-0.5 text-xs text-muted">
                        Without bed: {stay.currencyCode} {stay.withoutBedRate.toLocaleString("en-US")} / person / night
                      </p>
                    )}
                  </div>
                  <p className="shrink-0 text-sm font-semibold text-ink">{stay.nights}n</p>
                </div>
              ))}
            </div>
          </Card>

          {/* ---------------- transport ---------------- */}
          {q.transportLegs.length > 0 && (
            <Card>
              <div className="flex items-center gap-2 border-b border-line px-5 py-4">
                <Bus className="size-4 text-brand-500" />
                <h2 className="font-semibold text-ink">Transportation</h2>
              </div>
              <div className="divide-y divide-line">
                {q.transportLegs.map((leg, i) => (
                  <div key={i} className="flex items-start justify-between gap-4 px-5 py-3 text-sm">
                    <div>
                      <p className="font-medium text-ink">{leg.route}</p>
                      {leg.vehicle && <p className="text-xs text-muted">{leg.vehicle}</p>}
                    </div>
                    <p className="shrink-0 text-muted">
                      {leg.currencyCode} {leg.cost.toLocaleString("en-US")}
                    </p>
                  </div>
                ))}
              </div>
              <p className="border-t border-line px-5 py-3 text-xs text-muted">
                {q.transportDisplay === "included"
                  ? `Total ${money(q.transportTotal)}, included in the per-person price.`
                  : `Total ${money(q.transportTotal)}, printed as a separate charge outside the per-person price.`}
              </p>
            </Card>
          )}

          {/* ---------------- flight ---------------- */}
          <Card>
            <div className="flex items-center gap-2 border-b border-line px-5 py-4">
              <Plane className="size-4 text-brand-500" />
              <h2 className="font-semibold text-ink">Air Travel</h2>
            </div>
            <div className="space-y-1.5 px-5 py-4 text-sm">
              {q.flight.included ? (
                <>
                  {q.flight.airline && <p className="text-ink">{q.flight.airline}</p>}
                  <p className="text-ink">
                    <span className="text-muted">Going: </span>
                    {q.flight.outbound || "-"}
                  </p>
                  <p className="text-ink">
                    <span className="text-muted">Return: </span>
                    {q.flight.inbound || "one-way ticket only"}
                  </p>
                  <p className="pt-1 text-xs text-muted">
                    {q.flight.currencyCode} {q.flight.adultFare.toLocaleString("en-US")} per adult / child
                    {q.guest.infants > 0 && ` · ${q.flight.currencyCode} ${q.flight.infantFare.toLocaleString("en-US")} per infant`}
                  </p>
                </>
              ) : (
                <p className="text-muted">Ticket is not part of this package - the guest arranges their own travel.</p>
              )}
            </div>
          </Card>

          {/* ---------------- other charges ---------------- */}
          {q.charges.length > 0 && (
            <Card>
              <div className="border-b border-line px-5 py-4">
                <h2 className="font-semibold text-ink">Other charges</h2>
              </div>
              <div className="divide-y divide-line">
                {q.charges.map((charge, i) => (
                  <div key={i} className="flex items-center justify-between gap-4 px-5 py-3 text-sm">
                    <p className="font-medium text-ink">{charge.label}</p>
                    <p className="text-muted">
                      {charge.currencyCode} {charge.amount.toLocaleString("en-US")} · {BASIS_LABEL[charge.basis]}
                    </p>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* ---------------- payments (confirmed bookings only) ---------------- */}
          {q.status === "confirmed" && (
            <PaymentsCard<UmrahQuotation>
              quotation={q}
              onUpdated={setQ}
              apiBase="/api/umrah-quotations"
              total={{ amount: q.grandTotal, hint: party.join(" · ") }}
            />
          )}

          <div className="grid gap-5 sm:grid-cols-3">
            <ListCard title="Price Includes" items={q.includes} />
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
            <p className="text-xs font-semibold text-muted">PRICE PER PERSON</p>
            <div className="mt-1 space-y-2">
              {q.priceLines.map((line) => (
                <div key={line.key} className="flex items-baseline justify-between gap-3">
                  <span className="text-sm text-muted">{line.label}</span>
                  <span className="text-xl font-bold text-brand-600">{money(line.finalTotal)}</span>
                </div>
              ))}
            </div>
            <p className="mt-2 text-sm text-muted">{q.totalNights} nights</p>
            {!tiered && (
              <p className="mt-1 text-sm text-ink">
                Whole booking <span className="font-semibold">{money(q.grandTotal)}</span>
              </p>
            )}

            {/* Discount and round-off are visible to any signed-in staff, never on the PDF. */}
            {discounted.length > 0 && (
              <div className="mt-3 space-y-1.5 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
                {discounted.map((line) => (
                  <p key={line.key}>
                    {line.label}:{" "}
                    {line.discount > 0 && `${money(line.discount)} discount from ${money(line.subtotal)}`}
                    {line.discount > 0 && line.roundOff !== 0 && " · "}
                    {line.roundOff !== 0 && `rounded ${line.roundOff > 0 ? "up" : "down"} by ${money(Math.abs(line.roundOff))}`}
                  </p>
                ))}
                {q.discountNote && <p>Note: {q.discountNote}</p>}
              </div>
            )}

            <div className="mt-4">
              <p className="mb-2 text-sm text-muted">Status</p>
              <div className="flex flex-wrap gap-1.5">
                {STATUSES.map((status) => (
                  <button
                    key={status}
                    type="button"
                    disabled={savingStatus || !canEdit}
                    onClick={() => pickStatus(status)}
                    className={cn(
                      "rounded-lg border px-3 py-1 text-xs font-medium capitalize transition-colors",
                      "disabled:cursor-not-allowed disabled:opacity-60",
                      q.status === status
                        ? "border-brand-500 bg-brand-500 text-white"
                        : "border-line bg-white text-muted hover:border-gray-300 hover:text-ink",
                    )}
                  >
                    {status}
                  </button>
                ))}
              </div>
              {tiered && (
                <p className="mt-2 text-xs text-muted">
                  Separate room-type prices cannot be confirmed. Edit the quotation to One room type or Family first.
                </p>
              )}
              {q.status === "confirmed" && q.bookingRef && (
                <div className="mt-2 space-y-1 text-sm">
                  <p>
                    <span className="text-muted">Booking No.: </span>
                    <span className="font-semibold text-ink">{q.bookingRef}</span>
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
                      Edit booking no. / assigned staff
                    </button>
                  )}
                </div>
              )}
            </div>
          </Card>

          <Card className="p-5 text-sm">
            <dl className="space-y-2">
              <Row label="Quotation ID" value={q.quotationId} />
              {q.bookingRef && <Row label="Booking No." value={q.bookingRef} />}
              <Row label="Guest" value={q.guest.name} />
              <Row label="Party" value={party.join(", ")} />
              <Row label="Quote type" value={{ single: "One room type", family: "Family", tiered: "Room types" }[q.pricingMode]} />
              <Row label="Date" value={new Date(q.date).toLocaleDateString("en-GB")} />
              {q.validUntil && <Row label="Valid until" value={new Date(q.validUntil).toLocaleDateString("en-GB")} />}
              <Row label="Created by" value={q.createdByName || "-"} />
            </dl>
          </Card>

          {q.exchangeRates.length > 0 && (
            <Card className="p-5 text-sm">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Exchange rates used</p>
              <dl className="space-y-1">
                {q.exchangeRates.map((entry) => (
                  <Row key={entry.code} label={`1 ${entry.code}`} value={`${entry.rate.toLocaleString("en-US")} PKR`} />
                ))}
              </dl>
            </Card>
          )}

          <Card className="p-5">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">Package</p>
            <p className="mt-1 text-sm font-medium text-ink">{q.packageTitle || "-"}</p>
          </Card>
        </div>
      </div>

      <ConfirmDialog
        open={confirming}
        saving={savingStatus}
        initialRef={q.bookingRef}
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
          Include the letterhead
        </label>
        {!branding && (
          <p className="mt-1 text-xs text-muted">The PDF prints with no logo or letterhead - a neutral copy.</p>
        )}
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" size="sm" onClick={() => setShowPrint(false)}>
            Cancel
          </Button>
          <Button size="sm" icon={<Download className="size-4" />} loading={downloading} onClick={download}>
            Download PDF
          </Button>
        </div>
      </Modal>

      <Modal open={confirmDelete} onClose={() => setConfirmDelete(false)} title="Delete quotation">
        <p className="text-sm text-muted">
          Delete <strong className="text-ink">{q.quotationId}</strong> for {q.guest.name}? This cannot be undone.
          {q.status === "confirmed" && (
            <span className="mt-2 block text-brand-600">
              This booking is confirmed ({q.bookingRef}); deleting it frees that booking number
              {(q.payments?.length ?? 0) > 0 && " and removes its recorded payments"}.
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

const OTHER_STAFF = "__other__";

/**
 * Confirming a booking asks for its booking number. It is required, and the
 * server rejects one already used - that error surfaces as a toast while this
 * dialog stays open so the number can be corrected.
 */
function ConfirmDialog({
  open,
  saving,
  initialRef,
  initialStaff,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  saving: boolean;
  initialRef: string;
  initialStaff?: { userId: string | null; name: string };
  onCancel: () => void;
  onConfirm: (payload: { bookingRef: string; assignedStaffUserId: string | null; assignedStaffName: string }) => void;
}) {
  const [ref, setRef] = useState(initialRef);
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
    setRef(initialRef);
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
  }, [open, initialRef, initialStaff]);

  const trimmed = ref.trim();

  return (
    <Modal open={open} onClose={onCancel} title="Confirm booking">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (!trimmed) return;
          onConfirm({
            bookingRef: trimmed,
            assignedStaffUserId: staffChoice && staffChoice !== OTHER_STAFF ? staffChoice : null,
            assignedStaffName: staffChoice === OTHER_STAFF ? otherName.trim() : "",
          });
        }}
        className="space-y-4"
      >
        <p className="text-sm text-muted">
          Enter the booking number for this booking. It must be unique - the same number cannot be used on another
          booking.
        </p>
        <Field label="Booking No.">
          <Input value={ref} onChange={(e) => setRef(e.target.value)} placeholder="UB-2026-0001" autoFocus required />
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
          <Input value={otherName} onChange={(e) => setOtherName(e.target.value)} placeholder="Staff name" />
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

function ListCard({ title, items }: { title: string; items: StyledLine[] }) {
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
