"use client";

import { formatPrice } from "@junaidi/shared";
import Link from "next/link";
import { useEffect, useState } from "react";
import { FileText, Plus, TrendingUp } from "lucide-react";

import { PageHeader } from "@/components/app-shell";
import { Badge, Button, Card, EmptyState, Spinner } from "@/components/ui";
import { api } from "@/lib/api";
import type { QuotationList } from "@/lib/types";
import { useAuthStore } from "@/stores/auth";

export default function DashboardPage() {
  const user = useAuthStore((s) => s.user);
  const [data, setData] = useState<QuotationList | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get<QuotationList>("/api/quotations?pageSize=6")
      .then(setData)
      .finally(() => setLoading(false));
  }, []);

  const recent = data?.items ?? [];

  return (
    <>
      <PageHeader
        title={`Welcome, ${user?.name?.split(" ")[0] ?? ""}`}
        subtitle="Your recent quotations"
        action={
          <Link href="/quotations/new">
            <Button icon={<Plus className="size-4" />}>New Quotation</Button>
          </Link>
        }
      />

      <div className="space-y-5 p-5 lg:p-8">
        <div className="grid gap-4 sm:grid-cols-3">
          <StatCard icon={<FileText className="size-5" />} label="Total quotations" value={data ? String(data.total) : "—"} />
          <StatCard
            icon={<TrendingUp className="size-5" />}
            label="Latest value"
            value={recent[0] ? formatPrice(recent[0].finalTotal) : "—"}
          />
          <Link href="/quotations/new" className="block">
            <Card className="flex h-full items-center gap-3 border-dashed p-5 text-brand-600 transition-colors hover:bg-brand-50">
              <Plus className="size-5" />
              <span className="font-medium">Create a new quotation</span>
            </Card>
          </Link>
        </div>

        <Card>
          <div className="flex items-center justify-between border-b border-line px-5 py-4">
            <h2 className="font-semibold text-ink">Recent</h2>
            <Link href="/quotations" className="text-sm text-brand-600 hover:underline">
              View all
            </Link>
          </div>

          {loading ? (
            <Spinner label="Loading…" />
          ) : recent.length === 0 ? (
            <div className="p-5">
              <EmptyState
                icon={<FileText className="size-10" />}
                title="No quotations yet"
                hint="Create your first quotation to get started."
                action={
                  <Link href="/quotations/new">
                    <Button icon={<Plus className="size-4" />}>New Quotation</Button>
                  </Link>
                }
              />
            </div>
          ) : (
            <ul className="divide-y divide-line">
              {recent.map((q) => (
                <li key={q._id}>
                  <Link
                    href={`/quotations/${q._id}`}
                    className="flex items-center justify-between gap-4 px-5 py-3 transition-colors hover:bg-canvas"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-medium text-ink">{q.guest.name}</p>
                      <p className="text-xs text-muted">
                        {q.quotationId} · {q.packageCategory || "—"} · {q.totalNights} nights
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="hidden text-sm font-semibold text-ink sm:block">
                        {formatPrice(q.finalTotal)}
                      </span>
                      <Badge tone={q.status}>{q.status}</Badge>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <Card className="flex items-center gap-4 p-5">
      <div className="flex size-10 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
        {icon}
      </div>
      <div>
        <p className="text-xs text-muted">{label}</p>
        <p className="text-lg font-bold text-ink">{value}</p>
      </div>
    </Card>
  );
}
