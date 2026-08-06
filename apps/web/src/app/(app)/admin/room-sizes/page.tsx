"use client";

import { useEffect, useState } from "react";
import { BedDouble, Plus, Save, Trash2 } from "lucide-react";

import type { RoomSize } from "@junaidi/shared";

import { PageHeader } from "@/components/app-shell";
import { toast } from "@/components/toast";
import { Button, Card, Field, Input, NumberInput, Spinner } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { useConfigStore } from "@/stores/config";

/**
 * The room sizes a hotel can offer.
 *
 * Each is just a code and a label - Sharing, Quad, Triple, Double, Quint, Hexa
 * are the ones every hotel already uses, and more can be added here (e.g.
 * "Single").
 * A hotel then decides, per size, whether it prices independently (its own
 * column in Rates) or is wording for the Sharing rate (Rates > Hotels), which
 * is why nothing about price lives on this page.
 */
export default function RoomSizesPage() {
  const config = useConfigStore();
  const [showAdd, setShowAdd] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, { label: string; sharingGroupSize: number }>>({});
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    config.load();
  }, [config]);

  useEffect(() => {
    if (config.loaded) {
      setDrafts(
        Object.fromEntries(
          config.roomSizes.map((s) => [s.id, { label: s.label, sharingGroupSize: s.sharingGroupSize ?? 0 }]),
        ),
      );
    }
  }, [config.loaded, config.roomSizes]);

  async function save(size: RoomSize) {
    const draft = drafts[size.id] ?? { label: size.label, sharingGroupSize: size.sharingGroupSize ?? 0 };
    setBusy(size.id);
    try {
      await api.post("/api/admin/room-sizes", {
        id: size.id,
        season: config.season,
        code: size.code,
        label: draft.label,
        sharingGroupSize: draft.sharingGroupSize > 0 ? draft.sharingGroupSize : null,
        sortOrder: size.sortOrder,
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

  async function remove(size: RoomSize) {
    setBusy(size.id);
    try {
      await api.del(`/api/admin/room-sizes/${size.id}`);
      await config.load(undefined, true);
      toast.success(`${size.code} removed`);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Could not remove.");
    } finally {
      setBusy(null);
    }
  }

  if (!config.loaded) return <Spinner label="Loading room sizes…" />;

  return (
    <>
      <PageHeader
        title="Room Sizes"
        subtitle={`Season ${config.season} · the sizes a hotel can offer`}
        action={
          <Button icon={<Plus className="size-4" />} onClick={() => setShowAdd((v) => !v)}>
            Add size
          </Button>
        }
      />

      <div className="space-y-6 p-5 lg:p-8">
        <p className="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800">
          A hotel picks its sizes on its own page (Hotels): either its own priced room, or wording for
          the Sharing rate - never both. "Sharing group size" only matters for the wording use, e.g.
          Quint means 5.
        </p>

        {showAdd && (
          <AddRoomSize
            season={config.season}
            onDone={() => {
              setShowAdd(false);
              config.load(undefined, true);
            }}
          />
        )}

        <Card className="divide-y divide-line">
          {config.roomSizes.length === 0 && (
            <p className="px-5 py-4 text-sm text-muted">No room sizes yet.</p>
          )}
          {config.roomSizes.map((s) => {
            const draft = drafts[s.id] ?? { label: s.label, sharingGroupSize: s.sharingGroupSize ?? 0 };
            return (
              <div key={s.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                <BedDouble className="size-4 shrink-0 text-brand-500" />
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-ink">{s.code}</p>
                  <p className="text-xs text-muted">Priced size, or Sharing wording - set per hotel</p>
                </div>

                <label className="flex items-center gap-1 text-xs text-muted">
                  Label
                  <Input
                    value={draft.label}
                    onChange={(e) =>
                      setDrafts((d) => ({ ...d, [s.id]: { ...draft, label: e.target.value } }))
                    }
                    className="h-9 w-32"
                  />
                </label>
                <label className="flex items-center gap-1 text-xs text-muted">
                  Sharing group size
                  <NumberInput
                    min={0}
                    value={draft.sharingGroupSize}
                    onChange={(v) =>
                      setDrafts((d) => ({ ...d, [s.id]: { ...draft, sharingGroupSize: v } }))
                    }
                    placeholder="—"
                    className="h-9 w-20"
                  />
                </label>

                <Button
                  size="sm"
                  variant="secondary"
                  icon={<Save className="size-4" />}
                  loading={busy === s.id}
                  onClick={() => save(s)}
                >
                  Save
                </Button>
                <button
                  onClick={() => remove(s)}
                  className="rounded-lg p-2 text-gray-400 hover:bg-brand-50 hover:text-brand-600"
                  title="Remove size"
                >
                  <Trash2 className="size-4" />
                </button>
              </div>
            );
          })}
        </Card>
      </div>
    </>
  );
}

function AddRoomSize({ season, onDone }: { season: string; onDone: () => void }) {
  const [code, setCode] = useState("");
  const [label, setLabel] = useState("");
  const [sharingGroupSize, setSharingGroupSize] = useState(0);
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await api.post("/api/admin/room-sizes", {
        season,
        code: code.trim(),
        label: label.trim() || code.trim(),
        sharingGroupSize: sharingGroupSize > 0 ? sharingGroupSize : null,
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
          <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="Quint" required />
        </Field>
        <Field label="Label (optional)" className="w-40">
          <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Quint" />
        </Field>
        <Field label="Sharing group size (optional)" className="w-48">
          <NumberInput
            min={0}
            value={sharingGroupSize}
            onChange={setSharingGroupSize}
            placeholder="only if offered as wording"
          />
        </Field>
        <Button type="submit" loading={saving} disabled={!code.trim()}>
          Add
        </Button>
      </form>
    </Card>
  );
}
