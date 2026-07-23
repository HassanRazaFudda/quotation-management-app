"use client";

import {
  OCCUPANCIES,
  emptyRate,
  rateKey,
  type Accommodation,
  type Rate,
  type ResolvedBlock,
} from "@junaidi/shared";
import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Save } from "lucide-react";

import { PageHeader } from "@/components/app-shell";
import { toast } from "@/components/toast";
import { Button, Card, NumberInput, Spinner } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { useConfigStore } from "@/stores/config";

/**
 * The rate grid.
 *
 * Hajj accommodation is booked by the block at a negotiated figure, so a rate
 * belongs to a (hotel, block) pair and is the TOTAL for that stay - it is never
 * multiplied by nights. Each hotel therefore lists one row per block it can be
 * used in, and the shape of the inputs follows the location's pricing model.
 */
export default function RatesPage() {
  const config = useConfigStore();
  const [draft, setDraft] = useState<Record<string, Rate>>({});
  const [saving, setSaving] = useState<string | null>(null);

  useEffect(() => {
    config.load();
  }, [config]);

  /** Which pairs already have a stored rate — the rest are still to be priced. */
  const stored = useMemo(
    () => new Set(config.rates.map((r) => rateKey(r.accommodationId, r.blockId))),
    [config.rates],
  );

  useEffect(() => {
    if (!config.loaded) return;
    const byKey: Record<string, Rate> = {};
    for (const rate of config.rates) byKey[rateKey(rate.accommodationId, rate.blockId)] = rate;

    // Start a blank rate for every hotel/block pair that has none, so a block
    // the admin has just added can be priced instead of reading "no rate set"
    // with nothing to type into.
    for (const hotel of config.accommodations) {
      const location = config.locations.find((l) => l.id === hotel.locationId);
      if (!location) continue;

      for (const block of config.blocks) {
        if (!block.allowedLocationIds.includes(location.id)) continue;
        const key = rateKey(hotel.id, block.id);
        if (byKey[key]) continue;
        byKey[key] = emptyRate(location.pricingModel, {
          accommodationId: hotel.id,
          blockId: block.id,
          season: config.season,
        });
      }
    }

    setDraft(byKey);
  }, [
    config.loaded,
    config.rates,
    config.accommodations,
    config.locations,
    config.blocks,
    config.season,
  ]);

  const grouped = useMemo(
    () =>
      config.locations.map((location) => ({
        location,
        hotels: config.accommodations
          .filter((a) => a.locationId === location.id)
          .map((hotel) => ({
            hotel,
            // Only the blocks this hotel's location is allowed in.
            blocks: config.blocks.filter((b) => b.allowedLocationIds.includes(location.id)),
          })),
      })),
    [config.locations, config.accommodations, config.blocks],
  );

  function setRate(key: string, updater: (rate: Rate) => Rate) {
    setDraft((prev) => (prev[key] ? { ...prev, [key]: updater(prev[key]!) } : prev));
  }

  async function save(hotel: Accommodation, block: ResolvedBlock) {
    const key = rateKey(hotel.id, block.id);
    const rate = draft[key];
    if (!rate) return;

    setSaving(key);
    try {
      await api.patch(`/api/admin/rates/${hotel.id}`, {
        blockId: block.id,
        season: config.season,
        model: rate.model,
        rates: "rates" in rate ? rate.rates : undefined,
        amount: "amount" in rate ? rate.amount : undefined,
        sharing: "sharing" in rate ? rate.sharing : undefined,
        separate: "separate" in rate ? rate.separate : undefined,
      });
      toast.success(`Saved — ${hotel.name}, ${block.label}`);
      // Reload so a first-time rate stops being listed as unpriced.
      await config.load(undefined, true);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not save.");
    } finally {
      setSaving(null);
    }
  }

  if (!config.loaded) return <Spinner label="Loading rates…" />;

  const unpriced = Object.keys(draft).filter((key) => !stored.has(key)).length;

  return (
    <>
      <PageHeader
        title="Rates"
        subtitle={`Season ${config.season} · the total for the whole block, per person`}
      />

      <div className="space-y-6 p-5 lg:p-8">
        <p className="flex items-start gap-2 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          Each figure is the negotiated total for that hotel over that whole date
          block — not a nightly rate. Nothing is multiplied by the night count.
        </p>

        {unpriced > 0 && (
          <p className="flex items-start gap-2 rounded-lg bg-brand-50 px-4 py-3 text-sm text-brand-700">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            {unpriced} hotel/block {unpriced === 1 ? "pair has" : "pairs have"} no rate yet —
            marked <strong className="mx-1">Not priced</strong> below. A stay cannot be quoted
            until its rate is saved.
          </p>
        )}

        {grouped.map(({ location, hotels }) => (
          <div key={location.id}>
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">
              {location.name}
            </h2>

            <div className="space-y-4">
              {hotels.map(({ hotel, blocks }) => (
                <Card key={hotel.id}>
                  <div className="border-b border-line px-5 py-3">
                    <p className="font-medium text-ink">{hotel.name}</p>
                    <p className="text-xs text-muted">
                      {blocks.length} block{blocks.length === 1 ? "" : "s"} · {location.pricingModel}
                    </p>
                  </div>

                  <div className="divide-y divide-line">
                    {blocks.map((block) => {
                      const key = rateKey(hotel.id, block.id);
                      const rate = draft[key];
                      return (
                        <div
                          key={block.id}
                          className="flex flex-col gap-3 px-5 py-3 lg:flex-row lg:items-center"
                        >
                          <div className="lg:w-56">
                            <p className="text-sm font-medium text-ink">{block.label}</p>
                            <p className="text-xs text-muted">
                              {block.gregorianLabel ?? `${block.nights} nights`}
                              {block.gregorianLabel && ` · ${block.nights}n`}
                            </p>
                            {!stored.has(key) && (
                              <span className="mt-1 inline-block rounded bg-brand-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-brand-600">
                                Not priced
                              </span>
                            )}
                          </div>

                          <div className="flex-1">
                            {rate && <RateEditor rate={rate} onChange={(u) => setRate(key, u)} />}
                          </div>

                          <Button
                            size="sm"
                            variant="secondary"
                            icon={<Save className="size-4" />}
                            loading={saving === key}
                            onClick={() => save(hotel, block)}
                            disabled={!rate}
                          >
                            Save
                          </Button>
                        </div>
                      );
                    })}
                    {blocks.length === 0 && (
                      <p className="px-5 py-3 text-sm text-muted">
                        No date block allows {location.name} yet.
                      </p>
                    )}
                  </div>
                </Card>
              ))}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

function RateEditor({ rate, onChange }: { rate: Rate; onChange: (updater: (r: Rate) => Rate) => void }) {
  if (rate.model === "flat") {
    return (
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted">Block total</span>
        <NumberBox
          value={rate.amount}
          onChange={(v) => onChange((r) => (r.model === "flat" ? { ...r, amount: v } : r))}
        />
      </div>
    );
  }

  if (rate.model === "sharingOrSeparate") {
    return (
      <div className="space-y-2">
        {/* Sharing is one figure: a shared room may be four, five or six. */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="w-16 text-xs text-muted">Sharing</span>
          <NumberBox
            value={rate.sharing}
            onChange={(v) =>
              onChange((r) => (r.model === "sharingOrSeparate" ? { ...r, sharing: v } : r))
            }
          />
          <span className="text-xs text-gray-400">one rate — no occupancy</span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="w-16 text-xs text-muted">Separate</span>
          {OCCUPANCIES.map((occ) => (
            <NumberBox
              key={occ}
              label={occ}
              value={rate.separate[occ]}
              onChange={(v) =>
                onChange((r) =>
                  r.model === "sharingOrSeparate"
                    ? { ...r, separate: { ...r.separate, [occ]: v } }
                    : r,
                )
              }
            />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {OCCUPANCIES.map((occ) => (
        <NumberBox
          key={occ}
          label={occ}
          value={rate.rates[occ]}
          onChange={(v) =>
            onChange((r) => (r.model === "byOccupancy" ? { ...r, rates: { ...r.rates, [occ]: v } } : r))
          }
        />
      ))}
    </div>
  );
}

function NumberBox({ label, value, onChange }: { label?: string; value: number; onChange: (v: number) => void }) {
  return (
    <label className="flex items-center gap-1">
      {label && <span className="text-xs text-muted">{label}</span>}
      <NumberInput min={0} value={value} onChange={onChange} className="h-9 w-28" />
    </label>
  );
}
