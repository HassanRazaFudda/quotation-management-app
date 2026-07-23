"use client";

import { formatPrice } from "@junaidi/shared";
import Link from "next/link";
import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Copy, Download, Pencil, Plane } from "lucide-react";

import { PageHeader } from "@/components/app-shell";
import { toast } from "@/components/toast";
import { Badge, Button, Card, Field, Input, Modal, Spinner } from "@/components/ui";
import { cn } from "@/lib/cn";
import { api, ApiError } from "@/lib/api";
import type { Quotation, QuotationFlight } from "@/lib/types";
import { isAdmin, useAuthStore } from "@/stores/auth";

const STATUSES = ["draft", "sent", "confirmed", "expired"] as const;
type Status = (typeof STATUSES)[number];

export default function QuotationDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const [q, setQ] = useState<Quotation | null>(null);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [savingStatus, setSavingStatus] = useState(false);

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
      const blob = await api.pdf(`/api/quotations/${q._id}/pdf`);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${q.quotationId}_${q.guest.name.replace(/\s+/g, "_")}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not download.");
    } finally {
      setDownloading(false);
    }
  }

  async function duplicate() {
    if (!q) return;
    try {
      const copy = await api.post<Quotation>(`/api/quotations/${q._id}/duplicate`);
      toast.success(`Duplicated as ${copy.quotationId}`);
      router.push(`/quotations/${copy._id}`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not duplicate.");
    }
  }

  /** Confirming needs an HB number, so it goes through the dialog. */
  function pickStatus(status: Status) {
    if (!q || status === q.status) return;
    if (status === "confirmed") {
      setConfirming(true);
      return;
    }
    void changeStatus(status);
  }

  async function changeStatus(status: Status, hbNumber?: string) {
    if (!q) return;
    setSavingStatus(true);
    try {
      const updated = await api.post<Quotation>(`/api/quotations/${q._id}/status`, {
        status,
        hbNumber,
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
            <Button size="sm" icon={<Download className="size-4" />} loading={downloading} onClick={download}>
              PDF
            </Button>
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
                      {stay.accommodationName}
                      {stay.roomLabel && (
                        <span className="ml-2 text-xs font-normal text-muted">({stay.roomLabel})</span>
                      )}
                    </p>
                    <p className="text-xs text-muted">
                      {stay.blockLabelHijri}
                      {stay.blockLabelGregorian && ` · ${stay.blockLabelGregorian}`}
                    </p>
                    {(stay.meal || stay.mealNote) && (
                      <p className="mt-0.5 text-xs text-muted">
                        {stay.meal}
                        {stay.mealNote && ` — ${stay.mealNote}`}
                      </p>
                    )}
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-sm font-semibold text-ink">{stay.nights}n</p>
                    <p className="text-xs text-muted">{stay.lineTotal.toLocaleString("en-US")}</p>
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
                    Air fare included in the total — {formatPrice(q.flight.total)} per person
                  </p>
                </div>
              ) : (
                <p className="text-sm text-muted">
                  Flight is not part of this package — the guest arranges their own travel.
                </p>
              )}
            </div>
          </Card>

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
              items={q.qurbaniIncluded ? [...q.includes, "Qurbani."] : q.includes}
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
            <p className="text-3xl font-bold text-brand-600">{formatPrice(q.finalTotal)}</p>
            <p className="mt-1 text-sm text-muted">
              {q.totalNights} nights
              {q.flight?.included
                ? ` · incl. ${formatPrice(q.flight.total)} air fare`
                : " · flight not included"}
            </p>

            {/* Discount is admin-visible only, and never on the PDF. */}
            {isAdmin(user) && q.discount > 0 && (
              <div className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
                Internal: {formatPrice(q.discount)} discount applied
                {q.discountNote && ` — ${q.discountNote}`}
                <br />
                Subtotal was {formatPrice(q.subtotal)}
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
                <p className="mt-2 text-sm">
                  <span className="text-muted">HB Number: </span>
                  <span className="font-semibold text-ink">{q.hbNumber}</span>
                </p>
              )}
            </div>
          </Card>

          <Card className="p-5 text-sm">
            <dl className="space-y-2">
              <Row label="Quotation ID" value={q.quotationId} />
              {q.hbNumber && <Row label="HB Number" value={q.hbNumber} />}
              <Row label="Guest" value={q.guest.name} />
              <Row label="PAX" value={String(q.guest.pax)} />
              {q.packageCategory && <Row label="Category" value={q.packageCategory} />}
              <Row label="Qurbani" value={q.qurbaniIncluded ? "Included" : "Not included"} />
              <Row label="Mina" value={q.withoutMina ? "Without Mina" : "Included"} />
              <Row label="Date" value={new Date(q.date).toLocaleDateString("en-GB")} />
              {q.validUntil && (
                <Row label="Valid until" value={new Date(q.validUntil).toLocaleDateString("en-GB")} />
              )}
              <Row label="Created by" value={q.createdByName || "—"} />
            </dl>
          </Card>

          <Card className="p-5">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">Package</p>
            <p className="mt-1 text-sm font-medium text-ink">{q.packageTitle || "—"}</p>
          </Card>
        </div>
      </div>

      <ConfirmDialog
        open={confirming}
        saving={savingStatus}
        initialHb={q.hbNumber}
        onCancel={() => setConfirming(false)}
        onConfirm={(hb) => changeStatus("confirmed", hb)}
      />
    </>
  );
}

/**
 * Confirming a booking asks for its HB number. It is required, and the server
 * rejects one already used elsewhere - that error surfaces as a toast while
 * this dialog stays open so the number can be corrected.
 */
function ConfirmDialog({
  open,
  saving,
  initialHb,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  saving: boolean;
  initialHb: string;
  onCancel: () => void;
  onConfirm: (hbNumber: string) => void;
}) {
  const [hb, setHb] = useState(initialHb);

  // Reset the field each time the dialog is opened.
  useEffect(() => {
    if (open) setHb(initialHb);
  }, [open, initialHb]);

  const trimmed = hb.trim();

  return (
    <Modal open={open} onClose={onCancel} title="Confirm booking">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (trimmed) onConfirm(trimmed);
        }}
        className="space-y-4"
      >
        <p className="text-sm text-muted">
          Enter the HB number for this booking. It must be unique — the same
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

function ListCard({ title, items, note }: { title: string; items: string[]; note?: string }) {
  return (
    <Card className="p-5">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">{title}</p>
      {items.length > 0 ? (
        <ul className="list-disc space-y-1 pl-4 text-sm text-ink">
          {items.map((item, i) => (
            <li key={i}>{item}</li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted">—</p>
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
