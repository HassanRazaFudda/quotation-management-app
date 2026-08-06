"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { FileText, Package as PackageIcon, Pencil, Plus, Printer, Save, Trash2 } from "lucide-react";

import { formatMoney, TIER_OCCUPANCIES, type TierOccupancy } from "@junaidi/shared";

import { PageHeader } from "@/components/app-shell";
import { toast } from "@/components/toast";
import {
  Button,
  Card,
  EmptyState,
  Field,
  Input,
  Modal,
  NumberInput,
  Select,
  Spinner,
} from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import type { Package, Quotation } from "@/lib/types";
import { isAdmin, useAuthStore } from "@/stores/auth";
import { useConfigStore } from "@/stores/config";

/**
 * The Packages module - open to everyone.
 *
 * Staff can print a package (optionally against a customer's details) and start
 * a quotation from it. An admin additionally creates, edits and removes them.
 */
export default function PackagesPage() {
  const user = useAuthStore((s) => s.user);
  const admin = isAdmin(user);

  const [packages, setPackages] = useState<Package[] | null>(null);
  const [toRemove, setToRemove] = useState<Package | null>(null);
  const [removing, setRemoving] = useState(false);
  const [toPrint, setToPrint] = useState<Package | null>(null);

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
        subtitle="Print a package, or start a quotation from one"
        action={
          admin ? (
            <Link href="/admin/packages/new">
              <Button icon={<Plus className="size-4" />}>New package</Button>
            </Link>
          ) : undefined
        }
      />

      <div className="p-5 lg:p-8">
        {!packages ? (
          <Spinner label="Loading…" />
        ) : packages.length === 0 ? (
          <EmptyState
            icon={<PackageIcon className="size-10" />}
            title="No packages yet"
            hint={
              admin
                ? "Build a package once, and everyone can print it or quote from it."
                : "An admin has not set up any packages yet."
            }
            action={
              admin ? (
                <Link href="/admin/packages/new">
                  <Button icon={<Plus className="size-4" />}>New package</Button>
                </Link>
              ) : undefined
            }
          />
        ) : (
          <Card>
            <ul className="divide-y divide-line">
              {packages.map((pkg) => (
                <li key={pkg._id} className="flex flex-wrap items-center gap-3 px-4 py-3 hover:bg-canvas">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-ink">{pkg.name}</p>
                    <p className="truncate text-xs text-muted">
                      {pkg.packageCategory || "-"} · {pkg.stays.length} stays
                      {pkg.tierPricing?.enabled && " · 3-tier pricing"}
                      {pkg.flight.included && " · flights included"}
                    </p>
                  </div>

                  <Button
                    variant="secondary"
                    size="sm"
                    icon={<Printer className="size-4" />}
                    onClick={() => setToPrint(pkg)}
                  >
                    Print
                  </Button>

                  <Link href={`/quotations/new?package=${pkg._id}`}>
                    <Button variant="ghost" size="sm" icon={<FileText className="size-4" />}>
                      Quote
                    </Button>
                  </Link>

                  {admin && (
                    <>
                      <Link href={`/admin/packages/${pkg._id}/edit`}>
                        <Button variant="ghost" size="sm" icon={<Pencil className="size-4" />}>
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
                    </>
                  )}
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>

      <PrintModal pkg={toPrint} onClose={() => setToPrint(null)} />

      <Modal open={Boolean(toRemove)} onClose={() => setToRemove(null)} title="Remove package">
        <p className="text-sm text-muted">
          Remove <strong className="text-ink">{toRemove?.name}</strong>? It disappears from the
          Packages list. Quotations already made from it are not affected.
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

/**
 * Print a package to a PDF, or save it as a quotation.
 *
 * Customer details are optional for a print — blank prints a plain brochure.
 * "Save as quotation" needs a name (and, for a tiered package, a room tier): it
 * creates an ordinary draft quotation the customer can then be confirmed on,
 * with an HB number.
 */
function PrintModal({ pkg, onClose }: { pkg: Package | null; onClose: () => void }) {
  const router = useRouter();
  const config = useConfigStore();
  const [name, setName] = useState("");
  const [pax, setPax] = useState(1);
  const [validUntil, setValidUntil] = useState("");
  const [discount, setDiscount] = useState(0);
  const [tier, setTier] = useState<TierOccupancy | "">("");
  const [includedAddOns, setIncludedAddOns] = useState<string[]>([]);
  const [branding, setBranding] = useState(true);
  const [printing, setPrinting] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    config.load();
  }, [config]);

  const offeredTiers = pkg?.tierPricing?.enabled
    ? TIER_OCCUPANCIES.filter((occ) => pkg.tierPricing?.[occ])
    : [];
  const addOns = pkg?.addOns ?? [];
  // The package's own currency - not a print-time choice.
  const currencyCode = pkg?.currencyCode || "PKR";
  const currency =
    currencyCode === "PKR"
      ? { code: "PKR", symbol: "PKR", decimals: 0 }
      : (config.currencies.find((c) => c.code === currencyCode) ?? {
          code: "PKR",
          symbol: "PKR",
          decimals: 0,
        });

  // Reset the fields whenever a different package is opened; default the
  // tier. Add-ons start unchecked - staff opts each one in explicitly.
  useEffect(() => {
    setName("");
    setPax(1);
    setValidUntil("");
    setDiscount(0);
    setBranding(true);
    setIncludedAddOns([]);
    const first = pkg?.tierPricing?.enabled
      ? TIER_OCCUPANCIES.find((occ) => pkg.tierPricing?.[occ])
      : undefined;
    setTier(first ?? "");
  }, [pkg?._id]);

  const toggleAddOn = (label: string) =>
    setIncludedAddOns((list) =>
      list.includes(label) ? list.filter((l) => l !== label) : [...list, label],
    );

  async function print() {
    if (!pkg) return;
    setPrinting(true);
    try {
      const blob = await api.pdf(`/api/packages/${pkg._id}/pdf`, {
        body: {
          guest: { name: name.trim(), pax },
          validUntil: validUntil || null,
          discount,
          includedAddOns,
          branding,
        },
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const safe = pkg.name.replace(/[^\w\s-]/g, "").trim().replace(/\s+/g, "_");
      a.download = `${safe || "Package"}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      onClose();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not print.");
    } finally {
      setPrinting(false);
    }
  }

  async function saveAsQuotation() {
    if (!pkg || !name.trim()) return;
    setSaving(true);
    try {
      const created = await api.post<Quotation>(`/api/packages/${pkg._id}/quotation`, {
        guest: { name: name.trim(), pax },
        validUntil: validUntil || null,
        discount,
        tier: offeredTiers.length ? tier : null,
      });
      toast.success(`Created ${created.quotationId}`);
      router.push(`/quotations/${created._id}`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not save.");
    } finally {
      setSaving(false);
    }
  }

  const hasName = name.trim().length > 0;
  const canSave = hasName && (offeredTiers.length === 0 || Boolean(tier));

  return (
    <Modal open={Boolean(pkg)} onClose={onClose} title={`Print "${pkg?.name ?? ""}"`}>
      <p className="text-sm text-muted">
        Leave the customer blank for a plain brochure. Enter a name to address it to a guest - or to
        save it as a quotation you can confirm and give an HB number.
      </p>
      <div className="mt-4 space-y-4">
        <Field label="Guest name (optional for print, required to save)">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Rashid Shahid"
          />
        </Field>
        {hasName && (
          <>
            <div className="grid grid-cols-2 gap-4">
              <Field label="PAX">
                <NumberInput min={1} value={pax} onChange={setPax} fallback={1} />
              </Field>
              <Field label="Valid until (optional)">
                <Input
                  type="date"
                  value={validUntil}
                  onChange={(e) => setValidUntil(e.target.value)}
                />
              </Field>
            </div>
            {offeredTiers.length > 0 && (
              <Field label="Room tier (for the saved quotation's price)">
                <Select
                  options={offeredTiers.map((occ) => ({ value: occ, label: occ }))}
                  value={tier}
                  onChange={(e) => setTier(e.target.value as TierOccupancy)}
                />
              </Field>
            )}
          </>
        )}
        <Field label={`Discount in ${currencyCode} (optional, not shown on the PDF)`}>
          <NumberInput min={0} value={discount} onChange={setDiscount} placeholder="0" />
        </Field>
        {addOns.length > 0 && (
          <Field
            label="Optional extra services to include"
            hint="Every extra prints as available either way; checking one adds its amount to all the printed prices."
          >
            <div className="space-y-1.5">
              {addOns.map((addOn) => (
                <label key={addOn.label} className="flex items-center gap-2 text-sm text-ink">
                  <input
                    type="checkbox"
                    checked={includedAddOns.includes(addOn.label)}
                    onChange={() => toggleAddOn(addOn.label)}
                    className="size-4 accent-brand-500"
                  />
                  {addOn.label}
                  <span className="text-muted">+{formatMoney(addOn.amount, currency)}</span>
                </label>
              ))}
            </div>
          </Field>
        )}
        <label className="flex items-center gap-2 text-sm font-medium text-ink">
          <input
            type="checkbox"
            checked={branding}
            onChange={(e) => setBranding(e.target.checked)}
            className="size-4 accent-brand-500"
          />
          Include Junaidi branding
        </label>
        {!branding && (
          <p className="-mt-2 text-xs text-muted">
            The PDF prints with no logo, letterhead or agency signature - a neutral copy.
          </p>
        )}
      </div>
      <div className="mt-5 flex flex-wrap justify-end gap-2">
        <Button variant="secondary" size="sm" onClick={onClose}>
          Cancel
        </Button>
        <Button
          variant="secondary"
          size="sm"
          icon={<Save className="size-4" />}
          loading={saving}
          disabled={!canSave}
          onClick={saveAsQuotation}
        >
          Save as quotation
        </Button>
        <Button size="sm" icon={<Printer className="size-4" />} loading={printing} onClick={print}>
          Print PDF
        </Button>
      </div>
    </Modal>
  );
}
