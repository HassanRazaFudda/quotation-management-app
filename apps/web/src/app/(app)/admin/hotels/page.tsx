"use client";

import {
  MINA_TIERS,
  OCCUPANCIES,
  SHARING_WORD_SIZE,
  type Accommodation,
  type MinaTierOption,
  type RoomSize,
} from "@junaidi/shared";
import { useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Plus, Save, Trash2 } from "lucide-react";

import { LocationTabs, useActiveLocation } from "@/components/admin/location-tabs";
import { PageHeader } from "@/components/app-shell";
import { toast } from "@/components/toast";
import { Button, Card, Field, Input, Modal, NumberInput, Select, Spinner } from "@/components/ui";
import { cn } from "@/lib/cn";
import { api, ApiError } from "@/lib/api";
import { useConfigStore } from "@/stores/config";

/**
 * Used only until the admin's Room Sizes list has rows (a fresh environment,
 * or the seed has not run yet) - the original five, so the picker behaves
 * exactly as it always did rather than silently offering less.
 */
const FALLBACK_CODES: string[] = [
  ...OCCUPANCIES,
  ...Object.keys(SHARING_WORD_SIZE).filter((code) => !(OCCUPANCIES as readonly string[]).includes(code)),
];
const FALLBACK_ROOM_SIZES: RoomSize[] = FALLBACK_CODES.map((code, i) => ({
  id: code,
  code,
  label: code,
  sharingGroupSize: SHARING_WORD_SIZE[code] ?? null,
  sortOrder: i,
  active: true,
}));

/** Used only until the admin's Mina Tiers list has rows - the original three. */
const FALLBACK_MINA_TIERS: MinaTierOption[] = MINA_TIERS.map((code, i) => ({
  id: code,
  code,
  label: code.charAt(0).toUpperCase() + code.slice(1),
  sortOrder: i,
  active: true,
}));

export default function HotelsPage() {
  const config = useConfigStore();
  const [showAdd, setShowAdd] = useState(false);
  const { activeLocationId, setActiveLocationId } = useActiveLocation(config.locations);

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
  const active = grouped.find((g) => g.location.id === activeLocationId);

  async function move(locationId: string, hotels: Accommodation[], index: number, delta: number) {
    const target = index + delta;
    if (target < 0 || target >= hotels.length) return;
    const ids = hotels.map((h) => h.id);
    [ids[index], ids[target]] = [ids[target]!, ids[index]!];
    try {
      await api.post("/api/admin/hotels/reorder", { locationId, orderedIds: ids });
      config.load(undefined, true);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Could not reorder.");
    }
  }

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
        <LocationTabs
          locations={config.locations}
          value={activeLocationId}
          onChange={setActiveLocationId}
        />

        {showAdd && (
          <AddHotel
            defaultLocationId={activeLocationId}
            onDone={() => {
              setShowAdd(false);
              config.load(undefined, true);
            }}
          />
        )}

        {active && (
          <Card className="divide-y divide-line">
            {active.hotels.map((hotel, index) => (
              <HotelRow
                key={hotel.id}
                hotel={hotel}
                isMina={active.location.type === "mina"}
                onSaved={() => config.load(undefined, true)}
                onMoveUp={index > 0 ? () => move(active.location.id, active.hotels, index, -1) : undefined}
                onMoveDown={
                  index < active.hotels.length - 1
                    ? () => move(active.location.id, active.hotels, index, 1)
                    : undefined
                }
              />
            ))}
            {active.hotels.length === 0 && (
              <p className="px-5 py-3 text-sm text-muted">No hotels here yet.</p>
            )}
          </Card>
        )}
      </div>
    </>
  );
}

function HotelRow({
  hotel,
  isMina,
  onSaved,
  onMoveUp,
  onMoveDown,
}: {
  hotel: Accommodation;
  isMina: boolean;
  onSaved: () => void;
  /** Undefined when the hotel is already first/last, so the arrow is hidden. */
  onMoveUp?: () => void;
  onMoveDown?: () => void;
}) {
  const config = useConfigStore();
  // The vocabulary offered in both pickers: the admin's Room Sizes list, or the
  // original three when nothing has been configured there yet.
  const roomSizeOptions = config.roomSizes.length > 0 ? config.roomSizes : FALLBACK_ROOM_SIZES;
  const minaTierOptions =
    (config.minaTiers.length > 0 ? config.minaTiers : FALLBACK_MINA_TIERS).filter((t) => t.active);

  const [name, setName] = useState(hotel.name);
  const [mealIds, setMealIds] = useState<string[]>(hotel.allowedMealIds);
  const [noteIds, setNoteIds] = useState<string[]>(hotel.allowedMealNoteIds);
  // A hotel that has never been configured defaults to the original three
  // priced sizes. A newly admin-added size starts unchecked in both pickers,
  // so it is never offered anywhere until a hotel explicitly opts it in.
  const [occupancies, setOccupancies] = useState<string[]>(
    hotel.allowedOccupancies?.length ? hotel.allowedOccupancies : [...OCCUPANCIES],
  );
  const [sharingWords, setSharingWords] = useState<string[]>(
    hotel.allowedSharingWords?.length ? hotel.allowedSharingWords : ["Quad", "Quint", "Hexa"],
  );
  const [categoryIds, setCategoryIds] = useState<string[]>(hotel.allowedCategories ?? []);
  const [blockIds, setBlockIds] = useState<string[]>(hotel.allowedBlockIds ?? []);
  // Only the blocks this hotel's own location already allows are worth
  // offering here - narrowing further than that.
  const locationBlocks = config.blocks.filter((b) => b.allowedLocationIds.includes(hotel.locationId));
  // A Mina option is either a tent of some tier, or one that books no tent.
  const [minaTier, setMinaTier] = useState<string>(hotel.minaTier ?? "");
  const [withoutMina, setWithoutMina] = useState<boolean>(hotel.withoutMina ?? false);
  // This tent's own real bed count - shown to staff picking a tent, never
  // printed on the quote itself. 0 means "not set".
  const [bedsPerTent, setBedsPerTent] = useState<number>(hotel.bedsPerTent ?? 0);
  // Nothing chosen yet defaults to the first available tier, so what is shown
  // as selected and what actually saves are always the same thing.
  const displayedMinaTier = minaTier || minaTierOptions[0]?.code || "";
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function remove() {
    setDeleting(true);
    try {
      await api.del(`/api/admin/hotels/${hotel.id}`);
      toast.success(`${hotel.name} removed`);
      onSaved();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Could not remove.");
      setDeleting(false);
      setConfirmDelete(false);
    }
  }

  const toggle = <T extends string>(list: T[], setList: (v: T[]) => void, id: T) =>
    setList(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);

  // A size is either a priced room or Sharing wording, never both - so
  // picking it in one list drops it from the other immediately, rather than
  // waiting for the server to refuse it.
  function toggleOccupancy(code: string) {
    setOccupancies((list) => (list.includes(code) ? list.filter((c) => c !== code) : [...list, code]));
    setSharingWords((list) => list.filter((c) => c !== code));
  }
  function toggleSharingWord(code: string) {
    setSharingWords((list) => (list.includes(code) ? list.filter((c) => c !== code) : [...list, code]));
    setOccupancies((list) => list.filter((c) => c !== code));
  }

  async function save() {
    setSaving(true);
    try {
      await api.post("/api/admin/hotels", {
        id: hotel.id,
        locationId: hotel.locationId,
        name,
        minaTier: withoutMina ? null : (displayedMinaTier || null),
        bedsPerTent: !withoutMina && bedsPerTent > 0 ? bedsPerTent : null,
        withoutMina,
        allowedOccupancies: occupancies,
        allowedSharingWords: sharingWords,
        allowedCategories: categoryIds,
        allowedMealIds: mealIds,
        allowedMealNoteIds: noteIds,
        allowedBlockIds: blockIds,
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
        <div className="flex flex-col">
          <button
            onClick={onMoveUp}
            disabled={!onMoveUp}
            className="rounded p-0.5 text-gray-400 transition-colors hover:bg-canvas hover:text-ink disabled:cursor-not-allowed disabled:opacity-30"
            title="Move up"
          >
            <ArrowUp className="size-3.5" />
          </button>
          <button
            onClick={onMoveDown}
            disabled={!onMoveDown}
            className="rounded p-0.5 text-gray-400 transition-colors hover:bg-canvas hover:text-ink disabled:cursor-not-allowed disabled:opacity-30"
            title="Move down"
          >
            <ArrowDown className="size-3.5" />
          </button>
        </div>
        <Input value={name} onChange={(e) => setName(e.target.value)} className="max-w-md" />
        <Button size="sm" variant="secondary" icon={<Save className="size-4" />} loading={saving} onClick={save} className="ml-auto">
          Save
        </Button>
        <button
          onClick={() => setConfirmDelete(true)}
          className="rounded-lg p-2 text-gray-400 transition-colors hover:bg-brand-50 hover:text-brand-600"
          title="Remove"
        >
          <Trash2 className="size-4" />
        </button>
      </div>

      <Modal open={confirmDelete} onClose={() => setConfirmDelete(false)} title="Remove accommodation">
        <p className="text-sm text-muted">
          Remove <strong className="text-ink">{hotel.name}</strong>? It disappears from new
          quotations. Quotations that already used it keep their own copy and are not affected.
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" size="sm" onClick={() => setConfirmDelete(false)}>
            Cancel
          </Button>
          <Button variant="danger" size="sm" loading={deleting} onClick={remove}>
            Remove
          </Button>
        </div>
      </Modal>

      {/* A Mina option books a tent (its tier prints on the quote, in place of
          the Maktab category) or books no tent. The tier comes from the
          admin-managed Mina Tiers list - add a new one there for a camp that
          does not genuinely match Standard/Premium/Deluxe, rather than
          picking the closest of those and printing the wrong thing. */}
      {isMina && (
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="mr-1 text-xs font-medium text-muted">Mina tier:</span>
            <Select
              className="w-56"
              options={[
                ...minaTierOptions.map((t) => ({ value: t.code, label: t.label })),
                { value: "__none", label: "Books no tent (Without Mina)" },
              ]}
              value={withoutMina ? "__none" : displayedMinaTier}
              onChange={(e) => {
                const v = e.target.value;
                setWithoutMina(v === "__none");
                setMinaTier(v === "__none" ? "" : v);
              }}
            />
          </div>
          {!withoutMina && (
            <label className="flex items-center gap-1.5 text-xs text-muted">
              Beds in this tent
              <NumberInput
                min={0}
                value={bedsPerTent}
                onChange={setBedsPerTent}
                placeholder="—"
                className="h-9 w-20"
              />
            </label>
          )}
        </div>
      )}

      {/* A tent has no room sizes; every other accommodation does. */}
      {!isMina && (
        <>
          <ChipRow
            label="Room sizes"
            items={roomSizeOptions.map((s) => ({ id: s.code, label: s.label }))}
            selected={occupancies}
            onToggle={toggleOccupancy}
            hint={occupancies.length === 0 ? "pick at least one" : undefined}
          />

          {/* The shared room is the Sharing rate; these are the sizes it can be
              worded as (Quad / Quint / Hexa), never the price - an ordinary
              toggle like any other, ticked or not per hotel. Shown only when a
              shared room is offered, and only for sizes with a defined group
              size. */}
          {occupancies.includes("Sharing") && (
            <ChipRow
              label="Shared room sizes"
              items={roomSizeOptions
                .filter((s) => s.sharingGroupSize)
                .map((s) => ({ id: s.code, label: `${s.label} (${s.sharingGroupSize})` }))}
              selected={sharingWords}
              onToggle={toggleSharingWord}
              hint={
                sharingWords.length === 0
                  ? "none picked - still written “Sharing”, no wording"
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
          hint={categoryIds.length === 0 ? "none ticked - offered to every category" : undefined}
        />
      )}

      <ChipRow label="Meals" items={config.meals} selected={mealIds} onToggle={(id) => toggle(mealIds, setMealIds, id)} />
      <ChipRow label="Meal notes" items={config.mealNotes} selected={noteIds} onToggle={(id) => toggle(noteIds, setNoteIds, id)} />

      {/* Which date blocks this hotel is actually offered in. None ticked =
          every block its location allows - unchanged from before this existed. */}
      <ChipRow
        label="Date blocks"
        items={locationBlocks.map((b) => ({ id: b.id, label: b.label }))}
        selected={blockIds}
        onToggle={(id) => toggle(blockIds, setBlockIds, id)}
        hint={blockIds.length === 0 ? "none ticked - available in every block this location allows" : undefined}
      />
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

function AddHotel({
  defaultLocationId,
  onDone,
}: {
  /** Pre-fills from the active tab, but stays editable. */
  defaultLocationId: string;
  onDone: () => void;
}) {
  const config = useConfigStore();
  const [locationId, setLocationId] = useState(defaultLocationId);
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
