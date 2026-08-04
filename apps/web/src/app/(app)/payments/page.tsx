"use client";

import Link from "next/link";
import { Fragment, useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Search, Wallet } from "lucide-react";

import { formatMoney, paymentSummary, type PaymentStatus } from "@junaidi/shared";

import { PageHeader } from "@/components/app-shell";
import { Badge, Card, EmptyState, Input, Spinner } from "@/components/ui";
import { api } from "@/lib/api";
import type { Quotation, QuotationCurrency, QuotationList } from "@/lib/types";

const STATUS_LABEL: Record<PaymentStatus, string> = {
  paid: "Paid",
  partial: "Partially paid",
  unpaid: "Unpaid",
};
const FILTERS = ["all", "unpaid", "partial", "paid"] as const;
type Filter = (typeof FILTERS)[number];

/**
 * Payment management across all confirmed bookings: what each is worth, what has
 * come in, and what is still owed - each in the quotation's own currency.
 */
export default function PaymentsPage() {
  const [items, setItems] = useState<Quotation[] | null>(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  useEffect(() => {
    const params = new URLSearchParams({ status: "confirmed", pageSize: "100", sort: "created-desc" });
    if (search.trim()) params.set("search", search.trim());
    const timer = setTimeout(() => {
      api
        .get<QuotationList>(`/api/quotations?${params.toString()}`)
        .then((r) => setItems(r.items))
        .catch(() => setItems([]));
    }, 250);
    return () => clearTimeout(timer);
  }, [search]);

  const rows = useMemo(() => {
    return (items ?? []).map((q) => {
      const currency = q.currency ?? { code: "PKR", symbol: "PKR", decimals: 0 };
      const summary = paymentSummary({
        finalTotal: q.finalTotal,
        pax: q.guest.pax,
        decimals: currency.decimals,
        payments: q.payments ?? [],
      });
      return { q, currency, summary };
    });
  }, [items]);

  const visible = filter === "all" ? rows : rows.filter((r) => r.summary.status === filter);

  return (
    <>
      <PageHeader title="Payments" subtitle="Track what has been received against confirmed bookings" />

      <div className="space-y-5 p-5 lg:p-8">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-gray-400" />
            <Input
              className="pl-9"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by guest, quotation number, or HB number"
            />
          </div>
          <div className="flex flex-wrap gap-1.5">
            {FILTERS.map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setFilter(f)}
                className={`rounded-lg border px-3 py-1.5 text-xs font-medium capitalize transition-colors ${
                  filter === f
                    ? "border-brand-500 bg-brand-500 text-white"
                    : "border-line bg-white text-muted hover:text-ink"
                }`}
              >
                {f}
              </button>
            ))}
          </div>
        </div>

        {!items ? (
          <Spinner label="Loading…" />
        ) : visible.length === 0 ? (
          <EmptyState
            icon={<Wallet className="size-10" />}
            title="Nothing to show"
            hint="Confirmed bookings appear here once a quotation is confirmed with an HB number."
          />
        ) : (
          <Card className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="w-8 px-2 py-3"></th>
                  <th className="px-4 py-3 font-semibold">Guest</th>
                  <th className="px-4 py-3 font-semibold">Assigned staff</th>
                  <th className="px-4 py-3 font-semibold">HB Number</th>
                  <th className="px-4 py-3 text-right font-semibold">Grand total</th>
                  <th className="px-4 py-3 text-right font-semibold">Received</th>
                  <th className="px-4 py-3 text-right font-semibold">Outstanding</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {visible.map(({ q, currency, summary }) => {
                  const isOpen = expanded.has(q._id);
                  return (
                    <Fragment key={q._id}>
                      <tr className="hover:bg-canvas">
                        <td className="px-2 py-3 align-top">
                          <button
                            onClick={() => toggle(q._id)}
                            className="rounded p-1 text-gray-400 hover:bg-canvas hover:text-ink"
                            title={isOpen ? "Collapse" : "Expand payment history"}
                            aria-label="Toggle payment history"
                          >
                            {isOpen ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
                          </button>
                        </td>
                        <td className="px-4 py-3">
                          <Link href={`/quotations/${q._id}`} className="font-medium text-ink hover:text-brand-600">
                            {q.guest.name}
                          </Link>
                          <p className="text-xs text-muted">
                            {q.quotationId} · {q.guest.pax} pax
                          </p>
                        </td>
                        <td className="px-4 py-3 text-ink">{q.assignedStaff?.name || "—"}</td>
                        <td className="px-4 py-3 text-muted">{q.hbNumber || "—"}</td>
                        <td className="px-4 py-3 text-right text-ink">{formatMoney(summary.grandTotal, currency)}</td>
                        <td className="px-4 py-3 text-right text-emerald-600">{formatMoney(summary.totalReceived, currency)}</td>
                        <td className="px-4 py-3 text-right font-medium text-brand-600">
                          {formatMoney(summary.outstanding, currency)}
                        </td>
                        <td className="px-4 py-3">
                          <Badge tone={summary.status}>{STATUS_LABEL[summary.status]}</Badge>
                        </td>
                      </tr>
                      {isOpen && (
                        <tr>
                          <td colSpan={8} className="bg-canvas/60 px-4 py-3">
                            <PaymentHistory quotation={q} currency={currency} grandTotal={summary.grandTotal} />
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </Card>
        )}
      </div>
    </>
  );
}

/**
 * The full payment breakdown for one quotation, shown inline when a row is
 * expanded: every instalment with its running balance, so the money owed can be
 * traced without opening the quotation.
 */
function PaymentHistory({
  quotation,
  currency,
  grandTotal,
}: {
  quotation: Quotation;
  currency: QuotationCurrency;
  grandTotal: number;
}) {
  const payments = quotation.payments ?? [];
  if (payments.length === 0) {
    return <p className="text-xs text-muted">No payments recorded yet.</p>;
  }

  // Payments in date order, with the balance remaining after each one.
  const ordered = [...payments].sort((a, b) => a.date.localeCompare(b.date));
  let running = 0;

  return (
    <div className="overflow-x-auto rounded-lg border border-line bg-white">
      <table className="w-full text-xs">
        <thead className="border-b border-line text-left uppercase tracking-wide text-muted">
          <tr>
            <th className="px-3 py-2 font-semibold">Date</th>
            <th className="px-3 py-2 text-right font-semibold">Amount</th>
            <th className="px-3 py-2 text-right font-semibold">In {currency.code}</th>
            <th className="px-3 py-2 font-semibold">Method</th>
            <th className="px-3 py-2 font-semibold">Sales staff</th>
            <th className="px-3 py-2 font-semibold">Notes</th>
            <th className="px-3 py-2 text-right font-semibold">Balance</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {ordered.map((p) => {
            running += p.convertedAmount;
            const balance = Math.max(0, grandTotal - running);
            const foreign = p.paymentCurrency && p.paymentCurrency !== currency.code;
            return (
              <tr key={p._id}>
                <td className="px-3 py-2 text-muted">{new Date(p.date).toLocaleDateString("en-GB")}</td>
                <td className="px-3 py-2 text-right text-ink">
                  {p.amount.toLocaleString("en-US")} {p.paymentCurrency}
                  {foreign && <span className="ml-1 text-muted">@ {p.exchangeRate}</span>}
                </td>
                <td className="px-3 py-2 text-right text-emerald-600">
                  {formatMoney(p.convertedAmount, currency)}
                </td>
                <td className="px-3 py-2 text-muted">{p.method || "—"}</td>
                <td className="px-3 py-2 text-ink">{p.receivedByName || "—"}</td>
                <td className="px-3 py-2 text-muted">{p.notes || "—"}</td>
                <td className="px-3 py-2 text-right font-medium text-brand-600">
                  {formatMoney(balance, currency)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
