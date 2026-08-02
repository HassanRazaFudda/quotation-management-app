"use client";

import { formatMoney } from "@junaidi/shared";
import Link from "next/link";
import { Fragment, useEffect, useState } from "react";
import { Copy, FileText, Plus, Search } from "lucide-react";

import { PageHeader } from "@/components/app-shell";
import { Badge, Button, Card, EmptyState, Input, Select, Spinner } from "@/components/ui";
import { api } from "@/lib/api";
import type { Quotation, QuotationAuthor, QuotationList } from "@/lib/types";
import { useRouter } from "next/navigation";

const STATUSES = [
  { value: "", label: "All statuses" },
  { value: "draft", label: "Draft" },
  { value: "sent", label: "Sent" },
  { value: "confirmed", label: "Confirmed" },
  { value: "expired", label: "Expired" },
];

const GROUPS = [
  { value: "none", label: "No grouping" },
  { value: "staff", label: "Group by staff" },
  { value: "status", label: "Group by status" },
  { value: "month", label: "Group by month" },
];

const SORTS = [
  { value: "created-desc", label: "Newest added first" },
  { value: "created-asc", label: "Oldest added first" },
  { value: "date-desc", label: "Quotation date - newest" },
  { value: "date-asc", label: "Quotation date - oldest" },
];

export default function QuotationsPage() {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [createdBy, setCreatedBy] = useState("");
  const [groupBy, setGroupBy] = useState("none");
  const [sort, setSort] = useState("created-desc");
  const [authors, setAuthors] = useState<QuotationAuthor[]>([]);
  const [data, setData] = useState<QuotationList | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);

  // Who else has written quotations - the list is shared by the whole agency.
  useEffect(() => {
    api
      .get<QuotationAuthor[]>("/api/quotations/authors")
      .then(setAuthors)
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setLoading(true);
      const params = new URLSearchParams({ page: String(page), pageSize: "20", sort, groupBy });
      if (search.trim()) params.set("search", search.trim());
      if (status) params.set("status", status);
      if (createdBy) params.set("createdBy", createdBy);
      api
        .get<QuotationList>(`/api/quotations?${params}`, controller.signal)
        .then(setData)
        .catch(() => undefined)
        .finally(() => setLoading(false));
    }, 300);
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [search, status, createdBy, groupBy, sort, page]);

  function duplicate(q: Quotation) {
    // Pre-fill a new quotation from this one; it is created only on save.
    router.push(`/quotations/new?from=${q._id}`);
  }

  /** Anything the user changes reshuffles the list, so start again at page 1. */
  function change<T>(set: (value: T) => void) {
    return (value: T) => {
      set(value);
      setPage(1);
    };
  }

  const items = data?.items ?? [];
  const filtered = Boolean(search || status || createdBy);

  return (
    <>
      <PageHeader
        title="Quotations"
        subtitle="Everyone's work, across the agency"
        action={
          <Link href="/quotations/new">
            <Button icon={<Plus className="size-4" />}>New</Button>
          </Link>
        }
      />

      <div className="space-y-4 p-5 lg:p-8">
        <div className="space-y-2">
          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-gray-400" />
              <Input
                value={search}
                onChange={(e) => change(setSearch)(e.target.value)}
                placeholder="Search by guest, quotation number, or HB number"
                className="pl-9"
              />
            </div>
            <Select
              className="sm:w-48"
              options={STATUSES}
              value={status}
              onChange={(e) => change(setStatus)(e.target.value)}
            />
          </div>

          <div className="grid gap-2 sm:grid-cols-3">
            <Select
              options={[
                { value: "", label: "All staff" },
                ...authors.map((author) => ({ value: author.userId, label: author.name })),
              ]}
              value={createdBy}
              onChange={(e) => change(setCreatedBy)(e.target.value)}
            />
            <Select
              options={GROUPS}
              value={groupBy}
              onChange={(e) => change(setGroupBy)(e.target.value)}
            />
            <Select options={SORTS} value={sort} onChange={(e) => change(setSort)(e.target.value)} />
          </div>
        </div>

        {/* Clipped, so a group band at the very top keeps the rounded corner. */}
        <Card className="overflow-hidden">
          {loading && !data ? (
            <Spinner label="Loading…" />
          ) : items.length === 0 ? (
            <div className="p-5">
              <EmptyState
                icon={<FileText className="size-10" />}
                title="No quotations found"
                hint={filtered ? "Try a different search or filter." : "Create your first quotation."}
              />
            </div>
          ) : (
            <ul className="divide-y divide-line">
              {items.map((q, index) => (
                <Fragment key={q._id}>
                  {groupBy !== "none" && q.groupLabel !== items[index - 1]?.groupLabel && (
                    <li className="bg-canvas px-4 py-2 text-xs font-semibold uppercase tracking-wide text-muted">
                      {groupHeading(q.groupLabel, groupBy)}
                    </li>
                  )}
                  <li className="flex items-center gap-3 px-4 py-3 hover:bg-canvas">
                    <Link href={`/quotations/${q._id}`} className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="truncate font-medium text-ink">{q.guest.name}</p>
                        <Badge tone={q.status}>{q.status}</Badge>
                      </div>
                      <p className="truncate text-xs text-muted">
                        {q.quotationId}
                        {q.hbNumber && (
                          <span className="font-medium text-brand-600"> · {q.hbNumber}</span>
                        )}{" "}
                        · {new Date(q.date).toLocaleDateString("en-GB")} · {q.totalNights} nights ·{" "}
                        {q.createdByName}
                      </p>
                    </Link>
                    <span className="hidden text-sm font-semibold text-ink sm:block">
                      {formatMoney(q.finalTotal, q.currency)}
                    </span>
                    <button
                      onClick={() => duplicate(q)}
                      className="rounded-lg p-2 text-gray-400 hover:bg-brand-50 hover:text-brand-600"
                      title="Duplicate"
                    >
                      <Copy className="size-4" />
                    </button>
                  </li>
                </Fragment>
              ))}
            </ul>
          )}
        </Card>

        {data && data.pages > 1 && (
          <div className="flex items-center justify-center gap-2">
            <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              Previous
            </Button>
            <span className="text-sm text-muted">
              Page {data.page} of {data.pages}
            </span>
            <Button
              variant="secondary"
              size="sm"
              disabled={page >= data.pages}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </Button>
          </div>
        )}
      </div>
    </>
  );
}

/** The server sends months as "2026-07" so they sort; people read July 2026. */
function groupHeading(label: string | undefined, groupBy: string): string {
  if (!label) return "Unassigned";
  if (groupBy !== "month") return label;

  const [year, month] = label.split("-").map(Number);
  if (!year || !month) return label;

  return new Date(year, month - 1, 1).toLocaleDateString("en-GB", {
    month: "long",
    year: "numeric",
  });
}
