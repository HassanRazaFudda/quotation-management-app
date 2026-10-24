"use client";

import { UMRAH_TIER_CAPACITY, UMRAH_TIERS } from "@junaidi/shared";
import { Plus, Trash2 } from "lucide-react";

import { Button, Field, Input, NumberInput, RadioGroup } from "@/components/ui";
import { cn } from "@/lib/cn";
import { normaliseRooms, useUmrahBuilderStore, type UmrahBuilderStay } from "@/stores/umrah-builder";
import { CurrencySelect, NullableNumberInput } from "./fields";

/*
 * Layout note: every grid here answers to the width of the form column (a
 * container query), not the width of the screen. With the live preview beside
 * it the form is far narrower than the window, so a screen breakpoint would
 * squeeze twelve columns into a few hundred pixels. Narrow = two columns,
 * roomy (@2xl) = one tidy row.
 */

/**
 * One hotel in the trip: where, when, and what it costs. The nights come from
 * the dates, never typed. Which rate fields appear depends on the quote type -
 * a room line (single / family) or one rate per room type (room types).
 */
export function StayRow({
  stay,
  index,
  nights,
  invalid,
  removable,
}: {
  stay: UmrahBuilderStay;
  index: number;
  nights: number | undefined;
  invalid: boolean;
  removable: boolean;
}) {
  const { updateStay, removeStay, addRoom, updateRoom, removeRoom, pricingMode, pax, withoutBedPax } =
    useUmrahBuilderStore();

  const perRoom = stay.rateBasis === "room";
  const unit = perRoom ? "room" : "person";
  const rooms = normaliseRooms(pricingMode, pax, stay.rooms);
  const seated = rooms.reduce((sum, room) => sum + room.persons, 0);
  // Only a family quote with more than one room line can remove one; otherwise
  // the rate field takes the space the button would have used.
  const canRemoveRoom = pricingMode === "family" && rooms.length > 1;

  return (
    <div className={cn("space-y-3 rounded-lg border p-3", invalid ? "border-brand-200 bg-brand-50/40" : "border-line bg-white")}>
      <div className="grid grid-cols-2 gap-3 @2xl:grid-cols-12">
        <Field label="City" className="min-w-0 @2xl:col-span-3">
          <Input value={stay.city} onChange={(e) => updateStay(stay.key, { city: e.target.value })} placeholder="Makkah" />
        </Field>
        <Field label="Hotel" className="min-w-0 @2xl:col-span-5">
          <Input
            value={stay.hotelName}
            onChange={(e) => updateStay(stay.key, { hotelName: e.target.value })}
            placeholder="Emaar Al Khalil"
          />
        </Field>
        {/* With no remove button, Distance takes that spare column so the row
            still reaches the card's right edge like the rows beneath it. */}
        <Field
          label="Distance"
          className={cn("min-w-0", removable ? "@2xl:col-span-3" : "col-span-2 @2xl:col-span-4")}
        >
          <Input
            value={stay.distance}
            onChange={(e) => updateStay(stay.key, { distance: e.target.value })}
            placeholder="500 mtrs"
          />
        </Field>
        {removable && (
          <div className="flex items-end justify-end @2xl:col-span-1">
            <button
              type="button"
              onClick={() => removeStay(stay.key)}
              className="rounded-lg p-2 text-gray-400 transition-colors hover:bg-brand-50 hover:text-brand-600"
              title={`Remove stay ${index + 1}`}
            >
              <Trash2 className="size-4" />
            </button>
          </div>
        )}

        <Field label="Check-in" className="min-w-0 @2xl:col-span-3">
          <Input type="date" value={stay.checkIn} onChange={(e) => updateStay(stay.key, { checkIn: e.target.value })} />
        </Field>
        <Field label="Check-out" className="min-w-0 @2xl:col-span-3">
          <Input type="date" value={stay.checkOut} onChange={(e) => updateStay(stay.key, { checkOut: e.target.value })} />
        </Field>
        <div className="min-w-0 @2xl:col-span-2">
          <span className="mb-1.5 block text-sm text-muted">Nights</span>
          <div className="flex h-10 items-center rounded-lg border border-line bg-canvas px-3 text-sm font-semibold text-ink">
            {nights ? `${nights} ${nights === 1 ? "night" : "nights"}` : "-"}
          </div>
        </div>
        <Field label="Meal" className="min-w-0 @2xl:col-span-2">
          <Input value={stay.meal} onChange={(e) => updateStay(stay.key, { meal: e.target.value })} placeholder="Breakfast" />
        </Field>
        <Field label="Currency" className="min-w-0 @2xl:col-span-2">
          <CurrencySelect compact value={stay.currencyCode} onChange={(code) => updateStay(stay.key, { currencyCode: code })} />
        </Field>
      </div>

      <div className="space-y-3 rounded-lg border border-line bg-canvas/50 p-3">
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-sm text-muted">The hotel's rate ({stay.currencyCode}) is</span>
          <RadioGroup
            options={[
              { value: "room", label: "Per room per night" },
              { value: "person", label: "Per person per night" },
            ]}
            value={stay.rateBasis}
            onChange={(value) => updateStay(stay.key, { rateBasis: value })}
          />
        </div>

        {pricingMode === "tiered" ? (
          <TierRates stay={stay} unit={unit} />
        ) : (
          <div className="space-y-3">
            {rooms.map((room) => (
              <div key={room.key} className="grid grid-cols-2 gap-2 @2xl:grid-cols-12 @2xl:items-end">
                <Field label="Room type" className="min-w-0 @2xl:col-span-3">
                  <Input
                    list="umrah-room-types"
                    value={room.roomType}
                    onChange={(e) => updateRoom(stay.key, room.key, { roomType: e.target.value })}
                    placeholder="Quad"
                  />
                </Field>
                {perRoom && (
                  <Field label="Rooms" className="min-w-0 @2xl:col-span-2">
                    <NumberInput min={0} value={room.rooms} onChange={(v) => updateRoom(stay.key, room.key, { rooms: Math.round(v) })} />
                  </Field>
                )}
                <Field label="Guests" className={cn("min-w-0", perRoom ? "@2xl:col-span-3" : "@2xl:col-span-4")}>
                  <NumberInput
                    min={0}
                    value={room.persons}
                    disabled={pricingMode === "single"}
                    onChange={(v) => updateRoom(stay.key, room.key, { persons: Math.round(v) })}
                  />
                </Field>
                <Field
                  label={`Rate / ${unit} / night`}
                  className={cn(
                    "min-w-0",
                    perRoom
                      ? canRemoveRoom ? "@2xl:col-span-3" : "@2xl:col-span-4"
                      : canRemoveRoom ? "@2xl:col-span-4" : "@2xl:col-span-5",
                  )}
                >
                  <NumberInput
                    min={0}
                    step="any"
                    value={room.rate}
                    onChange={(v) => updateRoom(stay.key, room.key, { rate: v })}
                  />
                </Field>
                {canRemoveRoom && (
                  <div className="flex items-end justify-end @2xl:col-span-1">
                    <button
                      type="button"
                      onClick={() => removeRoom(stay.key, room.key)}
                      className="rounded-lg p-2 text-gray-400 hover:bg-brand-50 hover:text-brand-600"
                      title="Remove room"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                )}
              </div>
            ))}
            {pricingMode === "family" && (
              <div className="flex flex-wrap items-center gap-3">
                <Button variant="secondary" size="sm" icon={<Plus className="size-4" />} onClick={() => addRoom(stay.key)}>
                  Add another room type
                </Button>
                <span className={cn("text-xs", seated === pax ? "text-ok" : "text-brand-600")}>
                  {seated} of {pax} guests with a bed are seated
                </span>
              </div>
            )}
          </div>
        )}

        {withoutBedPax > 0 && (
          <Field
            label="Without-bed rate / person / night"
            hint={`For the ${withoutBedPax} guest${withoutBedPax === 1 ? "" : "s"} sharing a room without their own bed`}
            className="@2xl:w-1/2"
          >
            <NumberInput
              min={0}
              step="any"
              value={stay.withoutBedRate}
              onChange={(v) => updateStay(stay.key, { withoutBedRate: v })}
            />
          </Field>
        )}
      </div>
    </div>
  );
}

/** Room-types mode: one nightly rate per room type; leave a box empty if the hotel has no such room. */
function TierRates({ stay, unit }: { stay: UmrahBuilderStay; unit: string }) {
  const updateStay = useUmrahBuilderStore((s) => s.updateStay);
  return (
    <div className="space-y-1.5">
      <div className="grid gap-3 @xl:grid-cols-3">
        {UMRAH_TIERS.map((tier) => (
          <Field
            key={tier}
            label={`${tier} / ${unit} / night`}
            hint={stay.rateBasis === "room" ? `a ${tier} room holds ${UMRAH_TIER_CAPACITY[tier]}` : undefined}
            className="min-w-0"
          >
            <NullableNumberInput
              value={stay.tierRates[tier]}
              placeholder="not offered"
              onChange={(value) => updateStay(stay.key, { tierRates: { ...stay.tierRates, [tier]: value } })}
            />
          </Field>
        ))}
      </div>
      <p className="text-xs text-muted">Leave a box empty if this hotel has no such room.</p>
    </div>
  );
}
