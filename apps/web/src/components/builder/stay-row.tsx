"use client";

import {
  MINA_TIER_BEDS,
  roomChoiceValue,
  roomChoices,
  type ResolvedBlock,
} from "@junaidi/shared";
import { useEffect } from "react";
import { Trash2 } from "lucide-react";

import { Select } from "@/components/ui";
import { cn } from "@/lib/cn";
import {
  accommodationsForLocation,
  locationsForBlock,
  mealNotesForAccommodation,
  mealsForAccommodation,
  useConfigStore,
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
  const hotel = config.accommodations.find((a) => a.id === stay.accommodationId);
  // A hotel only offers the room sizes the admin recorded for it, so the list
  // narrows once the accommodation is chosen.
  const rooms = location
    ? roomChoices(
        location.pricingModel,
        pax,
        hotel?.allowedOccupancies ?? [],
        hotel?.allowedSharingWords ?? [],
      )
    : [];

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
          placeholder={stay.blockId ? "Location" : "—"}
          value={stay.locationId}
          disabled={!stay.blockId}
          onChange={(e) => onLocation(e.target.value)}
        />
        {rooms.length > 0 && (
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
          placeholder={stay.locationId ? "Hotel / Maktab" : "—"}
          value={stay.accommodationId}
          disabled={!stay.locationId}
          onChange={(e) =>
            updateStay(stay.key, { accommodationId: e.target.value, mealId: null, mealNoteId: null })
          }
        />
      </div>

      <div className="md:col-span-2">
        <MobileLabel>Meal</MobileLabel>
        <Select
          options={meals.map((m) => ({ value: m.id, label: m.label }))}
          placeholder={stay.accommodationId ? "Meal" : "—"}
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
          <p className="text-sm font-semibold text-ink">{nights ? `${nights}n` : "—"}</p>
          {lineTotal ? (
            <p className="text-xs text-muted">{lineTotal.toLocaleString("en-US")}</p>
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
    </div>
  );
}

function MobileLabel({ children }: { children: React.ReactNode }) {
  return <span className="mb-1 block text-xs font-medium text-muted md:hidden">{children}</span>;
}
