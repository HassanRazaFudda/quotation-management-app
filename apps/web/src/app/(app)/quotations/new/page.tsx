"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

import { PageHeader } from "@/components/app-shell";
import { Builder } from "@/components/builder/builder";
import { Spinner } from "@/components/ui";
import { toast } from "@/components/toast";
import { api, ApiError } from "@/lib/api";
import type { Quotation } from "@/lib/types";

export default function NewQuotationPage() {
  // useSearchParams needs a Suspense boundary in the App Router.
  return (
    <Suspense fallback={<Spinner label="Loading…" />}>
      <NewQuotation />
    </Suspense>
  );
}

function NewQuotation() {
  const from = useSearchParams().get("from");
  const [source, setSource] = useState<Quotation | null>(null);
  const [loading, setLoading] = useState(Boolean(from));

  useEffect(() => {
    if (!from) return;
    api
      .get<Quotation>(`/api/quotations/${from}`)
      .then(setSource)
      .catch((err) => toast.error(err instanceof ApiError ? err.message : "Could not load."))
      .finally(() => setLoading(false));
  }, [from]);

  if (loading) return <Spinner label="Loading…" />;

  return (
    <>
      <PageHeader
        title="New Quotation"
        subtitle={
          source
            ? `Duplicated from ${source.quotationId} — review and save to create`
            : "Build a Hajj package quotation"
        }
      />
      <Builder duplicateFrom={source ?? undefined} />
    </>
  );
}
