"use client";

import { use, useEffect, useState } from "react";

import { PageHeader } from "@/components/app-shell";
import { Builder } from "@/components/builder/builder";
import { Spinner } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { toast } from "@/components/toast";
import type { Package } from "@/lib/types";

export default function EditPackagePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [pkg, setPkg] = useState<Package | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get<Package>(`/api/packages/${id}`)
      .then(setPkg)
      .catch((err) => toast.error(err instanceof ApiError ? err.message : "Not found."))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <Spinner label="Loading…" />;
  if (!pkg) return <div className="p-8 text-muted">Package not found.</div>;

  return (
    <>
      <PageHeader title={`Edit ${pkg.name}`} subtitle="Predefined package" />
      <Builder asPackage editingPackage={pkg} />
    </>
  );
}
