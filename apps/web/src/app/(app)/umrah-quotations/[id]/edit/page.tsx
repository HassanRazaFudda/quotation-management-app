"use client";

import { use, useEffect, useState } from "react";

import { PageHeader } from "@/components/app-shell";
import { toast } from "@/components/toast";
import { Spinner } from "@/components/ui";
import { UmrahBuilder } from "@/components/umrah/umrah-builder";
import { api, ApiError } from "@/lib/api";
import type { UmrahQuotation } from "@/lib/umrah-types";

export default function EditUmrahQuotationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [q, setQ] = useState<UmrahQuotation | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get<UmrahQuotation>(`/api/umrah-quotations/${id}`)
      .then(setQ)
      .catch((err) => toast.error(err instanceof ApiError ? err.message : "Not found."))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <Spinner label="Loading…" />;
  if (!q) return <div className="p-8 text-muted">Quotation not found.</div>;

  return (
    <>
      <PageHeader title={`Edit ${q.quotationId}`} subtitle={q.guest.name} />
      <UmrahBuilder editing={q} />
    </>
  );
}
