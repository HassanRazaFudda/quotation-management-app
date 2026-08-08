"use client";

import { useEffect, useState } from "react";
import { Plus, Save, Tent, Trash2 } from "lucide-react";

import type { MinaTierOption } from "@junaidi/shared";

import { PageHeader } from "@/components/app-shell";
import { toast } from "@/components/toast";
import { Button, Card, Field, Input, Spinner } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { useConfigStore } from "@/stores/config";

/**
 * The Mina tiers a tent can be tagged with.
 *
 * Standard, Premium and Deluxe are the ones every setup starts with, and more
 * can be added here for a camp that does not genuinely match any of those -
 * a tier's code is what actually prints on a quotation ("Maktab A Category
 * (Deluxe)"), so a mismatched one prints the wrong thing. Bed count is set
 * per accommodation, on the Hotels page - not here, since two tents of the
 * same tier can still differ.
 */
export default function MinaTiersPage() {
  const config = useConfigStore();
  const [showAdd, setShowAdd] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    config.load();
  }, [config]);

  useEffect(() => {
    if (config.loaded) {
      setDrafts(Object.fromEntries(config.minaTiers.map((t) => [t.id, t.label])));
    }
  }, [config.loaded, config.minaTiers]);

  async function save(tier: MinaTierOption) {
    const label = drafts[tier.id] ?? tier.label;
    setBusy(tier.id);
    try {
      await api.post("/api/admin/mina-tiers", {
        id: tier.id,
        season: config.season,
        code: tier.code,
        label,
        sortOrder: tier.sortOrder,
        active: true,
      });
      await config.load(undefined, true);
      toast.success("Saved");
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Could not save.");
    } finally {
      setBusy(null);
    }
  }

  async function remove(tier: MinaTierOption) {
    setBusy(tier.id);
    try {
      await api.del(`/api/admin/mina-tiers/${tier.id}`);
      await config.load(undefined, true);
      toast.success(`${tier.code} removed`);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Could not remove.");
    } finally {
      setBusy(null);
    }
  }

  if (!config.loaded) return <Spinner label="Loading Mina tiers…" />;

  return (
    <>
      <PageHeader
        title="Mina Tiers"
        subtitle={`Season ${config.season} · the tiers a Mina tent can be tagged with`}
        action={
          <Button icon={<Plus className="size-4" />} onClick={() => setShowAdd((v) => !v)}>
            Add tier
          </Button>
        }
      />

      <div className="space-y-6 p-5 lg:p-8">
        <p className="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800">
          A tent picks its tier on its own page (Hotels), where its actual bed count is
          also set. The tier's label is what prints on a quotation in place of the
          Maktab category - add one here for a camp that does not genuinely match
          Standard, Premium or Deluxe, rather than picking the closest of those.
        </p>

        {showAdd && (
          <AddMinaTier
            season={config.season}
            onDone={() => {
              setShowAdd(false);
              config.load(undefined, true);
            }}
          />
        )}

        <Card className="divide-y divide-line">
          {config.minaTiers.length === 0 && (
            <p className="px-5 py-4 text-sm text-muted">No Mina tiers yet.</p>
          )}
          {config.minaTiers.map((t) => (
            <div key={t.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
              <Tent className="size-4 shrink-0 text-brand-500" />
              <div className="min-w-0 flex-1">
                <p className="font-medium text-ink">{t.code}</p>
                <p className="text-xs text-muted">Prints on the quotation as this tier's label</p>
              </div>

              <label className="flex items-center gap-1 text-xs text-muted">
                Label
                <Input
                  value={drafts[t.id] ?? t.label}
                  onChange={(e) => setDrafts((d) => ({ ...d, [t.id]: e.target.value }))}
                  className="h-9 w-40"
                />
              </label>

              <Button
                size="sm"
                variant="secondary"
                icon={<Save className="size-4" />}
                loading={busy === t.id}
                onClick={() => save(t)}
              >
                Save
              </Button>
              <button
                onClick={() => remove(t)}
                className="rounded-lg p-2 text-gray-400 hover:bg-brand-50 hover:text-brand-600"
                title="Remove tier"
              >
                <Trash2 className="size-4" />
              </button>
            </div>
          ))}
        </Card>
      </div>
    </>
  );
}

function AddMinaTier({ season, onDone }: { season: string; onDone: () => void }) {
  const [code, setCode] = useState("");
  const [label, setLabel] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await api.post("/api/admin/mina-tiers", {
        season,
        code: code.trim(),
        label: label.trim() || code.trim(),
      });
      toast.success(`${code.trim()} added`);
      onDone();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not add.");
      setSaving(false);
    }
  }

  return (
    <Card className="p-5">
      <form onSubmit={submit} className="flex flex-wrap items-end gap-3">
        <Field label="Code" className="w-32">
          <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="economy" required />
        </Field>
        <Field label="Label (optional)" className="w-40">
          <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Economy" />
        </Field>
        <Button type="submit" loading={saving} disabled={!code.trim()}>
          Add
        </Button>
      </form>
    </Card>
  );
}
