"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

import { PageHeader } from "@/components/app-shell";
import { toast } from "@/components/toast";
import { Spinner } from "@/components/ui";
import { UmrahBuilder } from "@/components/umrah/umrah-builder";
import { api, ApiError } from "@/lib/api";
import type { UmrahQuotation } from "@/lib/umrah-types";

export default function NewUmrahQuotationPage() {
  // useSearchParams needs a Suspense boundary in the App Router.
  return (
    <Suspense fallback={<Spinner label="Loading…" />}>
      <NewUmrahQuotation />
    </Suspense>
  );
}

function NewUmrahQuotation() {
  const from = useSearchParams().get("from"); // duplicate an existing quotation
  const [source, setSource] = useState<UmrahQuotation | null>(null);
  const [loading, setLoading] = useState(Boolean(from));

  useEffect(() => {
    if (!from) return;
    api
      .get<UmrahQuotation>(`/api/umrah-quotations/${from}`)
      .then(setSource)
      .catch((err) => toast.error(err instanceof ApiError ? err.message : "Could not load."))
      .finally(() => setLoading(false));
  }, [from]);

  if (loading) return <Spinner label="Loading…" />;

  return (
    <>
      <PageHeader
        title="New Umrah Quotation"
        subtitle={source ? `Duplicated from ${source.quotationId} - review and save to create` : "Build an Umrah package quotation"}
      />
      <UmrahBuilder duplicateFrom={source ?? undefined} />
    </>
  );
}
