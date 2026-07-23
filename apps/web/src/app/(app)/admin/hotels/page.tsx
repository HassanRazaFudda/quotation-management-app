"use client";

import {
  MINA_TIER_BEDS,
  OCCUPANCIES,
  SHARING_WORDS,
  SHARING_WORD_SIZE,
  type Accommodation,
  type Occupancy,
  type SharingWord,
} from "@junaidi/shared";
import { useEffect, useMemo, useState } from "react";
import { Plus, Save } from "lucide-react";

import { PageHeader } from "@/components/app-shell";
import { toast } from "@/components/toast";
import { Button, Card, Field, Input, Select, Spinner } from "@/components/ui";
import { cn } from "@/lib/cn";
import { api, ApiError } from "@/lib/api";
import { useConfigStore } from "@/stores/config";

export default function HotelsPage() {
  const config = useConfigStore();
  const [showAdd, setShowAdd] = useState(false);

  useEffect(() => {
    config.load();
  }, [config]);

  const grouped = useMemo(
    () =>
      config.locations.map((location) => ({
        location,
        hotels: config.accommodations.filter((a) => a.locationId === location.id),
      })),
    [config.locations, config.accommodations],
  );

  if (!config.loaded) return <Spinner label="Loading…" />;

  return (
    <>
      <PageHeader
        title="Hotels & Maktabs"
        subtitle="Accommodations and the meals each one offers"
        action={
          <Button icon={<Plus className="size-4" />} onClick={() => setShowAdd((v) => !v)}>
            Add hotel
          </Button>
        }
      />
      <div className="space-y-6 p-5 lg:p-8">
        {showAdd && <AddHotel onDone={() => { setShowAdd(false); config.load(undefined, true); }} />}

        {grouped.map(({ location, hotels }) => (
          <div key={location.id}>
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">{location.name}</h2>
            <Card className="divide-y divide-line">
              {hotels.map((hotel) => (
                <HotelRow
                  key={hotel.id}
                  hotel={hotel}
                  isMina={location.type === "mina"}
                  onSaved={() => config.load(undefined, true)}
                />
              ))}
              {hotels.length === 0 && <p className="px-5 py-3 text-sm text-muted">No hotels here yet.</p>}
            </Card>
          </div>
        ))}
      </div>
    </>
  );
}

function HotelRow({
  hotel,
  isMina,
  onSaved,
}: {
  hotel: Accommodation;
  isMina: boolean;
  onSaved: () => void;
}) {
  const config = useConfigStore();
  const [name, setName] = useState(hotel.name);
  const [mealIds, setMealIds] = useState<string[]>(hotel.allowedMealIds);
  const [noteIds, setNoteIds] = useState<string[]>(hotel.allowedMealNoteIds);
  const [occupancies, setOccupancies] = useState<Occupancy[]>(
    hotel.allowedOccupancies?.length ? hotel.allowedOccupancies : [...OCCUPANCIES],
  );
  const [sharingWords, setSharingWords] = useState<SharingWord[]>(
    hotel.allowedSharingWords?.length ? hotel.allowedSharingWords : [...SHARING_WORDS],
  );
  const [categoryIds, setCategoryIds] = useState<string[]>(hotel.allowedCategories ?? []);
  const [saving, setSaving] = useState(false);

  const toggle = <T extends string>(list: T[], setList: (v: T[]) => void, id: T) =>
    setList(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);

  async function save() {
    setSaving(true);
    try {
      await api.post("/api/admin/hotels", {
        id: hotel.id,
        locationId: hotel.locationId,
        name,
        minaTier: hotel.minaTier ?? null,
        bedsPerTent: hotel.bedsPerTent ?? null,
        withoutMina: hotel.withoutMina ?? false,
        allowedOccupancies: occupancies,
        allowedSharingWords: sharingWords,
        allowedCategories: categoryIds,
        allowedMealIds: mealIds,
        allowedMealNoteIds: noteIds,
        sortOrder: hotel.sortOrder,
        active: true,
      });
      toast.success("Saved");
      onSaved();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Could not save.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-3 p-5">
      <div className="flex items-center gap-3">
        <Input value={name} onChange={(e) => setName(e.target.value)} className="max-w-md" />
        {hotel.minaTier && (
          <span className="rounded bg-canvas px-2 py-1 text-xs text-muted">
            {hotel.minaTier} · {MINA_TIER_BEDS[hotel.minaTier as keyof typeof MINA_TIER_BEDS]}
          </span>
        )}
        {hotel.withoutMina && (
          <span className="rounded bg-brand-50 px-2 py-1 text-xs text-brand-600">
            books no tent
          </span>
        )}
        <Button size="sm" variant="secondary" icon={<Save className="size-4" />} loading={saving} onClick={save} className="ml-auto">
          Save
        </Button>
      </div>

      {/* A tent has no room sizes; every other accommodation does. */}
      {!isMina && (
        <>
          <ChipRow
            label="Room sizes"
            items={OCCUPANCIES.map((o) => ({ id: o, label: o }))}
            selected={occupancies}
            onToggle={(id) => toggle(occupancies, setOccupancies, id as Occupancy)}
            hint={occupancies.length === 0 ? "pick at least one" : undefined}
          />

          {/* The shared room is the Quad rate; these are the sizes it comes in,
              and they only decide the wording on the quote (Quint / Hexa),
              never the price. Shown only when a shared room is offered. */}
          {occupancies.includes("Quad") && (
            <ChipRow
              label="Shared room sizes"
              items={SHARING_WORDS.map((w) => ({ id: w, label: `${w} (${SHARING_WORD_SIZE[w]})` }))}
              selected={sharingWords}
              onToggle={(id) => toggle(sharingWords, setSharingWords, id as SharingWord)}
              hint={
                sharingWords.length === 0
                  ? "none — the room is always written “Sharing”"
                  : "wording only, same price as Sharing"
              }
            />
          )}
        </>
      )}

      {/* Which Maktab categories may be sold this option. None ticked = all. */}
      {isMina && (
        <ChipRow
          label="Categories"
          items={config.packageCategories}
          selected={categoryIds}
          onToggle={(id) => toggle(categoryIds, setCategoryIds, id)}
          hint={categoryIds.length === 0 ? "none ticked — offered to every category" : undefined}
        />
      )}

      <ChipRow label="Meals" items={config.meals} selected={mealIds} onToggle={(id) => toggle(mealIds, setMealIds, id)} />
      <ChipRow label="Meal notes" items={config.mealNotes} selected={noteIds} onToggle={(id) => toggle(noteIds, setNoteIds, id)} />
    </div>
  );
}

function ChipRow({
  label,
  items,
  selected,
  onToggle,
  hint,
}: {
  label: string;
  items: Array<{ id: string; label: string }>;
  selected: string[];
  onToggle: (id: string) => void;
  hint?: string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="mr-1 text-xs font-medium text-muted">{label}:</span>
      {hint && <span className="mr-1 text-xs text-brand-500">({hint})</span>}
      {items.map((item) => {
        const on = selected.includes(item.id);
        return (
          <button
            key={item.id}
            onClick={() => onToggle(item.id)}
            className={cn(
              "rounded-lg border px-2.5 py-1 text-xs transition-colors",
              on ? "border-brand-200 bg-brand-50 text-brand-700" : "border-line text-muted hover:border-gray-300",
            )}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}

function AddHotel({ onDone }: { onDone: () => void }) {
  const config = useConfigStore();
  const [locationId, setLocationId] = useState("");
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await api.post("/api/admin/hotels", {
        locationId,
        name,
        allowedMealIds: [],
        allowedMealNoteIds: [],
      });
      toast.success("Hotel added");
      onDone();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not add.");
      setSaving(false);
    }
  }

  return (
    <Card className="p-5">
      <form onSubmit={submit} className="flex flex-wrap items-end gap-3">
        <Field label="Location" className="w-48">
          <Select
            options={config.locations.map((l) => ({ value: l.id, label: l.name }))}
            placeholder="Select location"
            value={locationId}
            onChange={(e) => setLocationId(e.target.value)}
            required
          />
        </Field>
        <Field label="Hotel name" className="flex-1">
          <Input value={name} onChange={(e) => setName(e.target.value)} required />
        </Field>
        <Button type="submit" loading={saving} disabled={!locationId || !name}>
          Add
        </Button>
      </form>
    </Card>
  );
}
