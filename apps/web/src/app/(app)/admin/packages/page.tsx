"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Package as PackageIcon, Pencil, Plus, Trash2 } from "lucide-react";

import { PageHeader } from "@/components/app-shell";
import { toast } from "@/components/toast";
import { Button, Card, EmptyState, Modal, Spinner } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import type { Package } from "@/lib/types";

export default function PackagesPage() {
  const [packages, setPackages] = useState<Package[] | null>(null);
  const [toRemove, setToRemove] = useState<Package | null>(null);
  const [removing, setRemoving] = useState(false);

  function load() {
    api
      .get<{ packages: Package[] }>("/api/packages")
      .then((r) => setPackages(r.packages))
      .catch(() => setPackages([]));
  }

  useEffect(load, []);

  async function remove() {
    if (!toRemove) return;
    setRemoving(true);
    try {
      await api.del(`/api/admin/packages/${toRemove._id}`);
      toast.success(`"${toRemove.name}" removed`);
      setToRemove(null);
      load();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not remove.");
    } finally {
      setRemoving(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Packages"
        subtitle="Predefined quotations staff can start from"
        action={
          <Link href="/admin/packages/new">
            <Button icon={<Plus className="size-4" />}>New package</Button>
          </Link>
        }
      />

      <div className="p-5 lg:p-8">
        {!packages ? (
          <Spinner label="Loading…" />
        ) : packages.length === 0 ? (
          <EmptyState
            icon={<PackageIcon className="size-10" />}
            title="No packages yet"
            hint="Build a package once, and staff can start every quotation from it."
            action={
              <Link href="/admin/packages/new">
                <Button icon={<Plus className="size-4" />}>New package</Button>
              </Link>
            }
          />
        ) : (
          <Card>
            <ul className="divide-y divide-line">
              {packages.map((pkg) => (
                <li key={pkg._id} className="flex items-center gap-3 px-4 py-3 hover:bg-canvas">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-ink">{pkg.name}</p>
                    <p className="truncate text-xs text-muted">
                      {pkg.packageCategory || "-"} · {pkg.stays.length} stays
                      {pkg.flight.included && " · flights included"}
                    </p>
                  </div>
                  <Link href={`/admin/packages/${pkg._id}/edit`}>
                    <Button variant="secondary" size="sm" icon={<Pencil className="size-4" />}>
                      Edit
                    </Button>
                  </Link>
                  <button
                    onClick={() => setToRemove(pkg)}
                    className="rounded-lg p-2 text-gray-400 transition-colors hover:bg-brand-50 hover:text-brand-600"
                    title="Remove"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>

      <Modal open={Boolean(toRemove)} onClose={() => setToRemove(null)} title="Remove package">
        <p className="text-sm text-muted">
          Remove <strong className="text-ink">{toRemove?.name}</strong>? It disappears from the
          “start from package” list. Quotations already made from it are not affected.
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" size="sm" onClick={() => setToRemove(null)}>
            Cancel
          </Button>
          <Button variant="danger" size="sm" loading={removing} onClick={remove}>
            Remove
          </Button>
        </div>
      </Modal>
    </>
  );
}
