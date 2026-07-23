"use client";

import { use, useEffect, useState } from "react";

import { PageHeader } from "@/components/app-shell";
import { Builder } from "@/components/builder/builder";
import { Spinner } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { toast } from "@/components/toast";
import type { Quotation } from "@/lib/types";

export default function EditQuotationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [q, setQ] = useState<Quotation | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get<Quotation>(`/api/quotations/${id}`)
      .then(setQ)
      .catch((err) => toast.error(err instanceof ApiError ? err.message : "Not found."))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <Spinner label="Loading…" />;
  if (!q) return <div className="p-8 text-muted">Quotation not found.</div>;

  return (
    <>
      <PageHeader title={`Edit ${q.quotationId}`} subtitle={q.guest.name} />
      <Builder editing={q} />
    </>
  );
}
