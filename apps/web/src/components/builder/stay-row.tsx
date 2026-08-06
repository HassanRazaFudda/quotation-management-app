"use client";

import {
  allocatedHeadcount,
  MINA_TIER_BEDS,
  roomChoiceValue,
  roomChoices,
  type PricingModel,
  type ResolvedBlock,
  type RoomChoice,
  type RoomEntry,
} from "@junaidi/shared";
import { useEffect } from "react";
import { Plus, Trash2, Users } from "lucide-react";

import { NumberInput, Select } from "@/components/ui";
import { cn } from "@/lib/cn";
import {
  accommodationsForLocation,
  locationsForBlock,
  mealNotesForAccommodation,
  mealsForAccommodation,
  useConfigStore,
  wordSizeMap,
} from "@/stores/config";
import { useBuilderStore, type BuilderStay } from "@/stores/builder";

/**
 * One itinerary row.
 *
 * Each dropdown offers only what the one before it allows and fills itself in
 * where there is a sensible first choice. The meal note is the exception: many
 * stays have none, so it stays blank until chosen.
 *
 * The room dropdown adapts to the location - "Sharing / Triple / Double" for a
 * hotel, and "Sharing / Separate - Triple / Separate - Double" for Aziziya.
 */
export function StayRow({
  stay,
  blockOptions,
  nights,
  lineTotal,
  invalid,
}: {
  stay: BuilderStay;
  blockOptions: ResolvedBlock[];
  nights?: number;
  lineTotal?: number;
  invalid?: boolean;
}) {
  const config = useConfigStore();
  const { updateStay, removeStay, pax } = useBuilderStore();

  const locations = stay.blockId ? locationsForBlock(config, stay.blockId) : [];
  const accommodations = stay.locationId ? accommodationsForLocation(config, stay.locationId) : [];
  const meals = stay.accommodationId ? mealsForAccommodation(config, stay.accommodationId) : [];
  const notes = stay.accommodationId ? mealNotesForAccommodation(config, stay.accommodationId) : [];

  const block = blockOptions.find((b) => b.id === stay.blockId);
  const location = config.locations.find((l) => l.id === stay.locationId);
  const isMina = location?.type === "mina";
  const hotel = config.accommodations.find((a) => a.id === stay.accommodationId);
  // A hotel only offers the room sizes the admin recorded for it, so the list
  // narrows once the accommodation is chosen.
  const rooms = location
    ? roomChoices(
        location.pricingModel,
        pax,
        hotel?.allowedOccupancies ?? [],
        hotel?.allowedSharingWords ?? [],
        wordSizeMap(config),
      )
    : [];

  // A room mix splits one stay across room types (a family in a Sharing and a
  // Triple) or, for Mina, across tiers. The stay prices each entry by its own
  // headcount and the quotation shows one average per person.
  const mix = stay.rooms ?? [];
  const splitOn = mix.length > 0;
  const setRooms = (next: RoomEntry[]) =>
    updateStay(stay.key, { rooms: next.length > 0 ? next : undefined });

  // Fill in the obvious choice rather than making the staff member pick it.
  // Only ever sets a field that is still empty, so this settles immediately.
  const firstBlockId = blockOptions.length === 1 ? blockOptions[0]!.id : "";
  const firstLocationId = locations[0]?.id ?? "";
  const firstAccommodationId = accommodations[0]?.id ?? "";
  const firstMealId = meals[0]?.id ?? "";
  const firstRoom = rooms[0];

  useEffect(() => {
    // A date block is chosen automatically only when there is exactly one.
    if (!stay.blockId && firstBlockId) {
      updateStay(stay.key, { blockId: firstBlockId });
    } else if (stay.blockId && !stay.locationId && firstLocationId) {
      updateStay(stay.key, { locationId: firstLocationId });
    } else if (stay.locationId && !stay.accommodationId && firstAccommodationId) {
      updateStay(stay.key, { accommodationId: firstAccommodationId });
    } else if (stay.locationId && !stay.roomType && firstRoom) {
      updateStay(stay.key, {
        roomType: firstRoom.roomType,
        occupancy: firstRoom.occupancy,
        sharingWord: firstRoom.sharingWord,
      });
    } else if (stay.accommodationId && !stay.mealId && firstMealId) {
      updateStay(stay.key, { mealId: firstMealId });
    }
  }, [
    stay.key, stay.blockId, stay.locationId, stay.accommodationId, stay.mealId, stay.roomType,
    firstBlockId, firstLocationId, firstAccommodationId, firstMealId, firstRoom, updateStay,
  ]);

  // Changing a step clears everything downstream that depended on it.
  function onBlock(blockId: string) {
    updateStay(stay.key, {
      blockId,
      locationId: "",
      accommodationId: "",
      roomType: null,
      occupancy: null,
      sharingWord: null,
      mealId: null,
      mealNoteId: null,
    });
  }

  function onLocation(locationId: string) {
    updateStay(stay.key, {
      locationId,
      accommodationId: "",
      roomType: null,
      occupancy: null,
      sharingWord: null,
      mealId: null,
      mealNoteId: null,
    });
  }

  function onRoom(value: string) {
    const choice = rooms.find((r) => r.value === value);
    if (!choice) return;
    updateStay(stay.key, {
      roomType: choice.roomType,
      occupancy: choice.occupancy,
      sharingWord: choice.sharingWord,
      withoutBed: choice.withoutBed ?? false,
    });
  }

  return (
    <div
      className={cn(
        "grid grid-cols-1 gap-2 rounded-lg border bg-white p-3 md:grid-cols-12 md:items-start",
        invalid ? "border-brand-200 bg-brand-50/40" : "border-line",
      )}
    >
      <div className="md:col-span-3">
        <MobileLabel>Date Block</MobileLabel>
        <Select
          options={blockOptions.map((b) => ({
            value: b.id,
            label: `${b.label} · ${b.nights}n`,
          }))}
          placeholder={blockOptions.length === 0 ? "No block follows" : "Select block"}
          value={stay.blockId}
          onChange={(e) => onBlock(e.target.value)}
        />
        {block?.gregorianLabel && (
          <p className="mt-1 truncate text-xs text-muted">{block.gregorianLabel}</p>
        )}
      </div>

      <div className="md:col-span-2">
        <MobileLabel>Location</MobileLabel>
        <Select
          options={locations.map((l) => ({ value: l.id, label: l.name }))}
          placeholder={stay.blockId ? "Location" : "-"}
          value={stay.locationId}
          disabled={!stay.blockId}
          onChange={(e) => onLocation(e.target.value)}
        />
        {rooms.length > 0 && !splitOn && (
          <Select
            className="mt-2"
            options={rooms.map((r) => ({ value: r.value, label: r.label }))}
            placeholder="Room"
            value={roomChoiceValue(stay)}
            onChange={(e) => onRoom(e.target.value)}
          />
        )}
      </div>

      <div className="md:col-span-3">
        <MobileLabel>Accommodation</MobileLabel>
        <Select
          options={accommodations.map((a) => ({
            value: a.id,
            label: a.minaTier
              ? `${a.name} (${MINA_TIER_BEDS[a.minaTier as keyof typeof MINA_TIER_BEDS]})`
              : a.name,
          }))}
          placeholder={stay.locationId ? "Hotel / Maktab" : "-"}
          value={stay.accommodationId}
          // The Mina option is chosen once at the top and applied to every Hajj
          // row, so it is locked here to stop it being set two different ways.
          disabled={!stay.locationId || isMina}
          onChange={(e) =>
            updateStay(stay.key, { accommodationId: e.target.value, mealId: null, mealNoteId: null })
          }
        />
        {isMina && (
          <p className="mt-1 text-xs text-muted">Set from the Mina option above.</p>
        )}
      </div>

      <div className="md:col-span-2">
        <MobileLabel>Meal</MobileLabel>
        <Select
          options={meals.map((m) => ({ value: m.id, label: m.label }))}
          placeholder={stay.accommodationId ? "Meal" : "-"}
          value={stay.mealId ?? ""}
          disabled={!stay.accommodationId}
          onChange={(e) => updateStay(stay.key, { mealId: e.target.value || null })}
        />
        {notes.length > 0 && (
          <Select
            className="mt-2"
            options={notes.map((n) => ({ value: n.id, label: n.label }))}
            placeholder="Meal note (optional)"
            value={stay.mealNoteId ?? ""}
            onChange={(e) => updateStay(stay.key, { mealNoteId: e.target.value || null })}
          />
        )}
      </div>

      <div className="flex items-center justify-between gap-2 md:col-span-2 md:justify-end">
        <div className="text-right">
          <p className="text-sm font-semibold text-ink">{nights ? `${nights}n` : "-"}</p>
          {lineTotal ? (
            <p className="text-xs text-muted">{Math.round(lineTotal).toLocaleString("en-US")}</p>
          ) : stay.accommodationId ? (
            <p className="text-xs text-brand-500">no rate</p>
          ) : null}
        </div>
        <button
          onClick={() => removeStay(stay.key)}
          className="rounded-lg p-2 text-gray-400 transition-colors hover:bg-brand-50 hover:text-brand-600"
          title="Remove stay"
        >
          <Trash2 className="size-4" />
        </button>
      </div>

      {/* A family can split one stay across room types (Sharing + Triple) or, for
          Mina, across tiers. The quotation shows one average per person. */}
      {stay.accommodationId && (rooms.length > 0 || isMina) && (
        <div className="md:col-span-12">
          {!splitOn ? (
            <button
              onClick={() => setRooms([seedRoomEntry(stay, location?.pricingModel, pax)])}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-brand-600 hover:text-brand-700"
            >
              <Users className="size-3.5" />
              {isMina ? "Split across Mina tiers" : "Split into different rooms"}
            </button>
          ) : (
            <RoomMixEditor
              stay={stay}
              pax={pax}
              isMina={isMina}
              model={location?.pricingModel}
              allowedOccupancies={hotel?.allowedOccupancies ?? []}
              allowedSharingWords={hotel?.allowedSharingWords ?? []}
              wordSizes={wordSizeMap(config)}
              minaOptions={accommodations}
              onChange={setRooms}
            />
          )}
        </div>
      )}
    </div>
  );
}

/**
 * The first mix entry when a stay is split: the whole party in the stay's
 * current room. A still-unset occupancy defaults to "Sharing", the plain
 * shared room the mix's own "Sharing" option matches.
 */
function seedRoomEntry(stay: BuilderStay, model: PricingModel | undefined, pax: number): RoomEntry {
  const entry: RoomEntry = {
    accommodationId: stay.accommodationId,
    roomType: stay.roomType ?? null,
    occupancy: stay.occupancy ?? null,
    sharingWord: stay.sharingWord ?? null,
    withoutBed: stay.withoutBed ?? null,
    headcount: pax,
  };
  if (
    model === "byOccupancy" &&
    !entry.withoutBed &&
    entry.roomType === "sharing" &&
    (entry.occupancy ?? "Sharing") === "Sharing" &&
    !entry.sharingWord
  ) {
    entry.occupancy = "Sharing";
  }
  return entry;
}

/**
 * The per-stay room mix: a list of (room choice / tier + headcount) rows.
 *
 * Each row asks `roomChoices` for its own choices using its own headcount, not
 * the stay's total pax - so a 4-person row can be labelled "Quad" exactly as a
 * plain 4-person stay can, whatever the other rows add up to.
 */
function RoomMixEditor({
  stay,
  pax,
  isMina,
  model,
  allowedOccupancies,
  allowedSharingWords,
  wordSizes,
  minaOptions,
  onChange,
}: {
  stay: BuilderStay;
  pax: number;
  isMina: boolean;
  model: PricingModel | undefined;
  allowedOccupancies: string[];
  allowedSharingWords: string[];
  wordSizes: Record<string, number>;
  minaOptions: Array<{ id: string; name: string; minaTier?: string | null }>;
  onChange: (rooms: RoomEntry[]) => void;
}) {
  const mix = stay.rooms ?? [];
  const allocated = allocatedHeadcount(mix);
  const update = (i: number, patch: Partial<RoomEntry>) =>
    onChange(mix.map((entry, idx) => (idx === i ? { ...entry, ...patch } : entry)));

  const choicesFor = (headcount: number): RoomChoice[] =>
    model ? roomChoices(model, headcount, allowedOccupancies, allowedSharingWords, wordSizes) : [];

  function add() {
    const firstChoice = choicesFor(0)[0];
    const seed: RoomEntry = isMina
      ? { accommodationId: minaOptions[0]?.id ?? stay.accommodationId, headcount: 0 }
      : {
          accommodationId: stay.accommodationId,
          roomType: firstChoice?.roomType ?? null,
          occupancy: firstChoice?.occupancy ?? null,
          sharingWord: firstChoice?.sharingWord ?? null,
          headcount: 0,
        };
    onChange([...mix, seed]);
  }

  return (
    <div className="rounded-lg border border-line bg-canvas/60 p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-semibold text-ink">
          Room allocation {isMina ? "(mix of tiers)" : "(mix of room types)"}
        </span>
        <button onClick={() => onChange([])} className="text-xs text-muted hover:text-brand-600">
          Use one room
        </button>
      </div>

      <div className="space-y-2">
        {mix.map((entry, i) => {
          const choices = choicesFor(entry.headcount);
          return (
            <div key={i} className="flex items-center gap-2">
              {isMina ? (
                <Select
                  className="flex-1"
                  options={minaOptions.map((m) => ({
                    value: m.id,
                    label: m.minaTier
                      ? `${m.name} (${MINA_TIER_BEDS[m.minaTier as keyof typeof MINA_TIER_BEDS]})`
                      : m.name,
                  }))}
                  value={entry.accommodationId}
                  onChange={(e) => update(i, { accommodationId: e.target.value })}
                />
              ) : (
                <Select
                  className="flex-1"
                  options={choices.map((c) => ({ value: c.value, label: c.label }))}
                  placeholder="Room"
                  value={roomChoiceValue(entry)}
                  onChange={(e) => {
                    const choice = choices.find((c) => c.value === e.target.value);
                    if (choice) {
                      update(i, {
                        roomType: choice.roomType,
                        occupancy: choice.occupancy,
                        sharingWord: choice.sharingWord,
                        withoutBed: choice.withoutBed ?? false,
                      });
                    }
                  }}
                />
              )}
              <NumberInput
                className="w-20"
                min={0}
                value={entry.headcount}
                onChange={(v) => update(i, { headcount: v })}
              />
              <span className="text-xs text-muted">pax</span>
              <button
                onClick={() => onChange(mix.filter((_, idx) => idx !== i))}
                className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-brand-50 hover:text-brand-600"
                title="Remove room"
              >
                <Trash2 className="size-4" />
              </button>
            </div>
          );
        })}
      </div>

      <div className="mt-2 flex items-center justify-between">
        <button
          onClick={add}
          className="inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:text-brand-700"
        >
          <Plus className="size-3.5" /> Add room
        </button>
        <span
          className={cn(
            "text-xs font-medium",
            allocated === pax ? "text-muted" : "text-amber-700",
          )}
        >
          {allocated} / {pax} pax allocated
        </span>
      </div>
    </div>
  );
}

function MobileLabel({ children }: { children: React.ReactNode }) {
  return <span className="mb-1 block text-xs font-medium text-muted md:hidden">{children}</span>;
}
