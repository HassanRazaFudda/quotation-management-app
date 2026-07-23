"use client";

import { formatPrice } from "@junaidi/shared";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Copy, FileText, Plus, Search } from "lucide-react";

import { PageHeader } from "@/components/app-shell";
import { toast } from "@/components/toast";
import { Badge, Button, Card, EmptyState, Input, Select, Spinner } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import type { Quotation, QuotationList } from "@/lib/types";
import { useRouter } from "next/navigation";

const STATUSES = [
  { value: "", label: "All statuses" },
  { value: "draft", label: "Draft" },
  { value: "sent", label: "Sent" },
  { value: "confirmed", label: "Confirmed" },
  { value: "expired", label: "Expired" },
];

export default function QuotationsPage() {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [data, setData] = useState<QuotationList | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);

  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setLoading(true);
      const params = new URLSearchParams({ page: String(page), pageSize: "20" });
      if (search.trim()) params.set("search", search.trim());
      if (status) params.set("status", status);
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
  }, [search, status, page]);

  async function duplicate(q: Quotation) {
    try {
      const copy = await api.post<Quotation>(`/api/quotations/${q._id}/duplicate`);
      toast.success(`Duplicated as ${copy.quotationId}`);
      router.push(`/quotations/${copy._id}`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not duplicate.");
    }
  }

  const items = data?.items ?? [];

  return (
    <>
      <PageHeader
        title="Quotations"
        action={
          <Link href="/quotations/new">
            <Button icon={<Plus className="size-4" />}>New</Button>
          </Link>
        }
      />

      <div className="space-y-4 p-5 lg:p-8">
        <div className="flex flex-col gap-2 sm:flex-row">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-gray-400" />
            <Input
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="Search by guest or quotation number"
              className="pl-9"
            />
          </div>
          <Select
            className="sm:w-48"
            options={STATUSES}
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
          />
        </div>

        <Card>
          {loading && !data ? (
            <Spinner label="Loading…" />
          ) : items.length === 0 ? (
            <div className="p-5">
              <EmptyState
                icon={<FileText className="size-10" />}
                title="No quotations found"
                hint={search || status ? "Try a different search or filter." : "Create your first quotation."}
              />
            </div>
          ) : (
            <ul className="divide-y divide-line">
              {items.map((q) => (
                <li key={q._id} className="flex items-center gap-3 px-4 py-3 hover:bg-canvas">
                  <Link href={`/quotations/${q._id}`} className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate font-medium text-ink">{q.guest.name}</p>
                      <Badge tone={q.status}>{q.status}</Badge>
                    </div>
                    <p className="text-xs text-muted">
                      {q.quotationId} · {q.packageCategory || "—"} · {q.totalNights} nights · {q.createdByName}
                    </p>
                  </Link>
                  <span className="hidden text-sm font-semibold text-ink sm:block">
                    {formatPrice(q.finalTotal)}
                  </span>
                  <button
                    onClick={() => duplicate(q)}
                    className="rounded-lg p-2 text-gray-400 hover:bg-brand-50 hover:text-brand-600"
                    title="Duplicate"
                  >
                    <Copy className="size-4" />
                  </button>
                </li>
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
