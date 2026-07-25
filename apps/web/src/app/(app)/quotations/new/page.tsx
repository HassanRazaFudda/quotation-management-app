"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

import { PageHeader } from "@/components/app-shell";
import { Builder } from "@/components/builder/builder";
import { Spinner } from "@/components/ui";
import { toast } from "@/components/toast";
import { api, ApiError } from "@/lib/api";
import type { Package, Quotation } from "@/lib/types";

export default function NewQuotationPage() {
  // useSearchParams needs a Suspense boundary in the App Router.
  return (
    <Suspense fallback={<Spinner label="Loading…" />}>
      <NewQuotation />
    </Suspense>
  );
}

function NewQuotation() {
  const params = useSearchParams();
  const from = params.get("from"); // duplicate an existing quotation
  const packageId = params.get("package"); // start from a package

  const [source, setSource] = useState<Quotation | null>(null);
  const [pkg, setPkg] = useState<Package | null>(null);
  const [loading, setLoading] = useState(Boolean(from || packageId));

  useEffect(() => {
    if (from) {
      api
        .get<Quotation>(`/api/quotations/${from}`)
        .then(setSource)
        .catch((err) => toast.error(err instanceof ApiError ? err.message : "Could not load."))
        .finally(() => setLoading(false));
    } else if (packageId) {
      api
        .get<Package>(`/api/packages/${packageId}`)
        .then(setPkg)
        .catch((err) => toast.error(err instanceof ApiError ? err.message : "Could not load."))
        .finally(() => setLoading(false));
    }
  }, [from, packageId]);

  if (loading) return <Spinner label="Loading…" />;

  const subtitle = source
    ? `Duplicated from ${source.quotationId} — review and save to create`
    : pkg
      ? `Started from "${pkg.name}" — review and save to create`
      : "Build a Hajj package quotation";

  return (
    <>
      <PageHeader title="New Quotation" subtitle={subtitle} />
      <Builder duplicateFrom={source ?? undefined} startPackage={pkg ?? undefined} />
    </>
  );
}
