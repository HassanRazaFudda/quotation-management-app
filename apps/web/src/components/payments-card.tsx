"use client";

import { useEffect, useMemo, useState } from "react";
import { Pencil, Plus, Trash2, Wallet } from "lucide-react";

import { convertPayment, formatMoney, paymentSummary, type PaymentStatus } from "@junaidi/shared";

import { toast } from "@/components/toast";
import {
  Badge,
  Button,
  Card,
  Field,
  Input,
  Modal,
  NumberInput,
  Select,
  Textarea,
} from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import type { Quotation, QuotationPayment } from "@/lib/types";
import { useConfigStore } from "@/stores/config";

const OTHER = "__other__";
const STATUS_LABEL: Record<PaymentStatus, string> = {
  paid: "Paid",
  partial: "Partially paid",
  unpaid: "Unpaid",
};

/**
 * Payment management for a confirmed booking: the running financial picture, the
 * list of payments, and a form to add or correct them. All figures are in the
 * quotation's own currency; a payment taken in another currency is converted at
 * a rate frozen on the entry.
 */
export function PaymentsCard({
  quotation,
  onUpdated,
}: {
  quotation: Quotation;
  onUpdated: (q: Quotation) => void;
}) {
  const config = useConfigStore();
  const [staff, setStaff] = useState<Array<{ id: string; name: string }>>([]);
  const [editing, setEditing] = useState<QuotationPayment | null>(null);
  const [open, setOpen] = useState(false);
  const [toRemove, setToRemove] = useState<QuotationPayment | null>(null);
  const [removing, setRemoving] = useState(false);

  useEffect(() => {
    config.load();
    api
      .get<{ users: Array<{ id: string; name: string }> }>("/api/users/basic")
      .then((r) => setStaff(r.users))
      .catch(() => undefined);
  }, [config]);

  const currency = quotation.currency ?? { code: "PKR", symbol: "PKR", decimals: 0 };
  const payments = quotation.payments ?? [];
  const money = (v: number) => formatMoney(v, currency);

  const summary = useMemo(
    () =>
      paymentSummary({
        finalTotal: quotation.finalTotal,
        pax: quotation.guest.pax,
        decimals: currency.decimals,
        payments,
      }),
    [quotation.finalTotal, quotation.guest.pax, currency.decimals, payments],
  );

  async function remove() {
    if (!toRemove) return;
    setRemoving(true);
    try {
      const updated = await api.del<Quotation>(
        `/api/quotations/${quotation._id}/payments/${toRemove._id}`,
      );
      onUpdated(updated);
      toast.success("Payment removed");
      setToRemove(null);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not remove.");
    } finally {
      setRemoving(false);
    }
  }

  return (
    <Card>
      <div className="flex items-center justify-between border-b border-line px-5 py-4">
        <div className="flex items-center gap-2">
          <Wallet className="size-4 text-brand-500" />
          <h2 className="font-semibold text-ink">Payments</h2>
          <Badge tone={summary.status}>{STATUS_LABEL[summary.status]}</Badge>
        </div>
        <Button
          size="sm"
          icon={<Plus className="size-4" />}
          onClick={() => {
            setEditing(null);
            setOpen(true);
          }}
        >
          Add payment
        </Button>
      </div>

      {/* -------- financial summary -------- */}
      <div className="grid gap-px bg-line sm:grid-cols-3">
        <Stat label="Grand total" value={money(summary.grandTotal)} hint={`${summary.pax} pax · ${money(summary.costPerPerson)} / person`} />
        <Stat label="Received" value={money(summary.totalReceived)} tone="green" />
        <Stat
          label="Outstanding"
          value={money(summary.outstanding)}
          tone={summary.outstanding > 0 ? "red" : "muted"}
          hint={summary.overpaid > 0 ? `Overpaid by ${money(summary.overpaid)}` : undefined}
        />
      </div>

      {/* -------- payment list -------- */}
      <div className="divide-y divide-line">
        {payments.length === 0 ? (
          <p className="px-5 py-6 text-center text-sm text-muted">
            No payments recorded yet. Add the first instalment above.
          </p>
        ) : (
          payments.map((p) => {
            const differentCurrency = p.paymentCurrency && p.paymentCurrency !== currency.code;
            return (
              <div key={p._id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-ink">
                    {money(p.convertedAmount)}
                    {differentCurrency && (
                      <span className="ml-2 text-xs font-normal text-muted">
                        ({p.amount.toLocaleString("en-US")} {p.paymentCurrency} @ {p.exchangeRate})
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-muted">
                    {new Date(p.date).toLocaleDateString("en-GB")}
                    {p.method && ` · ${p.method}`}
                    {p.receivedByName && ` · by ${p.receivedByName}`}
                  </p>
                  {p.notes && <p className="mt-0.5 text-xs text-muted">{p.notes}</p>}
                </div>
                <button
                  onClick={() => {
                    setEditing(p);
                    setOpen(true);
                  }}
                  className="rounded-lg p-2 text-gray-400 hover:bg-canvas hover:text-ink"
                  title="Edit"
                >
                  <Pencil className="size-4" />
                </button>
                <button
                  onClick={() => setToRemove(p)}
                  className="rounded-lg p-2 text-gray-400 hover:bg-brand-50 hover:text-brand-600"
                  title="Remove"
                >
                  <Trash2 className="size-4" />
                </button>
              </div>
            );
          })
        )}
      </div>

      <PaymentModal
        open={open}
        onClose={() => setOpen(false)}
        quotationId={quotation._id}
        currency={currency}
        currencyOptions={currencyOptions(currency.code, config.currencies)}
        staff={staff}
        editing={editing}
        onSaved={(q) => {
          onUpdated(q);
          setOpen(false);
        }}
      />

      <Modal open={Boolean(toRemove)} onClose={() => setToRemove(null)} title="Remove payment">
        <p className="text-sm text-muted">
          Remove this {toRemove ? money(toRemove.convertedAmount) : ""} payment? This cannot be
          undone.
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" size="sm" onClick={() => setToRemove(null)}>
            Cancel
          </Button>
          <Button variant="danger" size="sm" loading={removing} onClick={remove}>
            Remove
          </Button>
        </div>
      </Modal>
    </Card>
  );
}

/** Currency codes the payment may be taken in: the quotation's own first, then the rest. */
function currencyOptions(
  quotationCode: string,
  currencies: Array<{ code: string; enabled: boolean }>,
): string[] {
  const codes = [quotationCode, "PKR", ...currencies.filter((c) => c.enabled).map((c) => c.code)];
  return [...new Set(codes)];
}

function Stat({
  label,
  value,
  hint,
  tone = "ink",
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "ink" | "green" | "red" | "muted";
}) {
  const color =
    tone === "green" ? "text-emerald-600" : tone === "red" ? "text-brand-600" : tone === "muted" ? "text-muted" : "text-ink";
  return (
    <div className="bg-white px-5 py-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</p>
      <p className={`text-lg font-bold ${color}`}>{value}</p>
      {hint && <p className="text-xs text-muted">{hint}</p>}
    </div>
  );
}

function PaymentModal({
  open,
  onClose,
  quotationId,
  currency,
  currencyOptions,
  staff,
  editing,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  quotationId: string;
  currency: { code: string; symbol: string; decimals: number };
  currencyOptions: string[];
  staff: Array<{ id: string; name: string }>;
  editing: QuotationPayment | null;
  onSaved: (q: Quotation) => void;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const [date, setDate] = useState(today);
  const [amount, setAmount] = useState(0);
  const [payCurrency, setPayCurrency] = useState(currency.code);
  const [rate, setRate] = useState(1);
  const [method, setMethod] = useState("");
  const [notes, setNotes] = useState("");
  const [staffChoice, setStaffChoice] = useState(""); // user id, or OTHER
  const [otherName, setOtherName] = useState("");
  const [saving, setSaving] = useState(false);

  // Load the form each time it opens - blank for a new payment, filled to edit.
  useEffect(() => {
    if (!open) return;
    if (editing) {
      setDate(editing.date.slice(0, 10));
      setAmount(editing.amount);
      setPayCurrency(editing.paymentCurrency || currency.code);
      setRate(editing.exchangeRate || 1);
      setMethod(editing.method);
      setNotes(editing.notes);
      const known = staff.find((s) => s.id === editing.receivedByUserId);
      setStaffChoice(editing.receivedByUserId && known ? editing.receivedByUserId : OTHER);
      setOtherName(editing.receivedByUserId && known ? "" : editing.receivedByName);
    } else {
      setDate(today);
      setAmount(0);
      setPayCurrency(currency.code);
      setRate(1);
      setMethod("");
      setNotes("");
      setStaffChoice(staff[0]?.id ?? OTHER);
      setOtherName("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editing]);

  const sameCurrency = payCurrency === currency.code;
  const effectiveRate = sameCurrency ? 1 : rate;
  const converted = convertPayment(amount, effectiveRate, currency.decimals);
  const receiverName = staffChoice === OTHER ? otherName.trim() : (staff.find((s) => s.id === staffChoice)?.name ?? "");
  const canSave = amount > 0 && receiverName.length > 0 && (sameCurrency || rate > 0);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!canSave) return;
    setSaving(true);
    const body = {
      date,
      amount,
      paymentCurrency: payCurrency,
      exchangeRate: effectiveRate,
      method,
      notes,
      receivedByUserId: staffChoice === OTHER ? null : staffChoice,
      receivedByName: staffChoice === OTHER ? otherName.trim() : "",
    };
    try {
      const path = editing
        ? `/api/quotations/${quotationId}/payments/${editing._id}`
        : `/api/quotations/${quotationId}/payments`;
      const updated = editing
        ? await api.patch<Quotation>(path, body)
        : await api.post<Quotation>(path, body);
      onSaved(updated);
      toast.success(editing ? "Payment updated" : "Payment recorded");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not save.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={editing ? "Edit payment" : "Record a payment"}>
      <form onSubmit={submit} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <Field label="Payment date">
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
          </Field>
          <Field label={`Amount received (${payCurrency})`}>
            <NumberInput min={0} value={amount} onChange={setAmount} placeholder="0" />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Currency">
            <Select
              options={currencyOptions.map((c) => ({ value: c, label: c }))}
              value={payCurrency}
              onChange={(e) => setPayCurrency(e.target.value)}
            />
          </Field>
          {!sameCurrency && (
            <Field label={`1 ${payCurrency} = ? ${currency.code}`}>
              <NumberInput min={0} value={rate} onChange={setRate} placeholder="0" />
            </Field>
          )}
        </div>

        {!sameCurrency && (
          <p className="-mt-2 text-xs text-muted">
            Counts as <strong className="text-ink">{formatMoney(converted, currency)}</strong> toward
            the total.
          </p>
        )}

        <Field label="Received by (sales staff)">
          <Select
            options={[
              ...staff.map((s) => ({ value: s.id, label: s.name })),
              { value: OTHER, label: "Other (type a name)" },
            ]}
            value={staffChoice}
            onChange={(e) => setStaffChoice(e.target.value)}
          />
        </Field>
        {staffChoice === OTHER && (
          <Input
            value={otherName}
            onChange={(e) => setOtherName(e.target.value)}
            placeholder="Sales staff name"
          />
        )}

        <div className="grid grid-cols-2 gap-4">
          <Field label="Method (optional)">
            <Input value={method} onChange={(e) => setMethod(e.target.value)} placeholder="Cash / Bank" />
          </Field>
        </div>

        <Field label="Notes (optional)">
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
        </Field>

        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" loading={saving} disabled={!canSave}>
            {editing ? "Save changes" : "Record payment"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
