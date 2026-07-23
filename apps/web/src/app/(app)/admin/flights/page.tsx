"use client";

import { FLIGHT_DIRECTIONS, formatPrice, type FlightOption } from "@junaidi/shared";
import { useEffect, useState } from "react";
import { Plane, Plus, Save, Trash2 } from "lucide-react";

import { PageHeader } from "@/components/app-shell";
import { toast } from "@/components/toast";
import { Button, Card, Field, Input, NumberInput, Select, Spinner } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { useConfigStore } from "@/stores/config";

/**
 * The air sectors the agency sells, with their fares.
 *
 * Outbound sectors fly into Jeddah or Madinah; inbound ones fly home from
 * either, so a guest can arrive in Madinah and leave from Jeddah.
 */
export default function FlightsPage() {
  const config = useConfigStore();
  const [showAdd, setShowAdd] = useState(false);
  const [prices, setPrices] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    config.load();
  }, [config]);

  useEffect(() => {
    if (config.loaded) {
      setPrices(Object.fromEntries(config.flights.map((f) => [f.id, f.price])));
    }
  }, [config.loaded, config.flights]);

  async function savePrice(flight: FlightOption) {
    setBusy(flight.id);
    try {
      await api.post("/api/admin/flights", {
        id: flight.id,
        season: config.season,
        direction: flight.direction,
        origin: flight.origin,
        destination: flight.destination,
        returnFrom: flight.returnFrom ?? "",
        airline: flight.airline,
        price: prices[flight.id] ?? flight.price,
        sortOrder: flight.sortOrder,
        active: true,
      });
      await config.load(undefined, true);
      toast.success("Fare saved");
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Could not save.");
    } finally {
      setBusy(null);
    }
  }

  async function remove(flight: FlightOption) {
    setBusy(flight.id);
    try {
      await api.del(`/api/admin/flights/${flight.id}`);
      await config.load(undefined, true);
      toast.success("Sector removed");
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Could not remove.");
    } finally {
      setBusy(null);
    }
  }

  if (!config.loaded) return <Spinner label="Loading flights…" />;

  return (
    <>
      <PageHeader
        title="Flights"
        subtitle={`Season ${config.season} · fare per person`}
        action={
          <Button icon={<Plus className="size-4" />} onClick={() => setShowAdd((v) => !v)}>
            Add flight
          </Button>
        }
      />

      <div className="space-y-6 p-5 lg:p-8">
        {showAdd && (
          <AddFlight
            season={config.season}
            onDone={() => {
              setShowAdd(false);
              config.load(undefined, true);
            }}
          />
        )}

        {FLIGHT_DIRECTIONS.map((direction) => {
          const sectors = config.flights.filter((f) => f.direction === direction);
          return (
            <div key={direction}>
              <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">
                {DIRECTION_HEADING[direction]}
              </h2>
              <Card className="divide-y divide-line">
                {sectors.map((flight) => (
                  <div key={flight.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                    <Plane
                      className={cnDirection(direction)}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-ink">
                        {direction === "roundtrip"
                          ? `${flight.origin} → ${flight.destination}${
                              flight.returnFrom && flight.returnFrom !== flight.destination
                                ? ` · ${flight.returnFrom} → ${flight.origin}`
                                : " → " + flight.origin
                            }`
                          : `${flight.origin} → ${flight.destination}`}
                      </p>
                      <p className="text-xs text-muted">{flight.airline || "—"}</p>
                    </div>
                    <NumberInput
                      min={0}
                      value={prices[flight.id] ?? flight.price}
                      onChange={(v) => setPrices((p) => ({ ...p, [flight.id]: v }))}
                      className="h-9 w-32"
                    />
                    <span className="hidden w-32 text-right text-xs text-muted sm:block">
                      {formatPrice(prices[flight.id] ?? flight.price)}
                    </span>
                    <Button
                      size="sm"
                      variant="secondary"
                      icon={<Save className="size-4" />}
                      loading={busy === flight.id}
                      onClick={() => savePrice(flight)}
                    >
                      Save
                    </Button>
                    <button
                      onClick={() => remove(flight)}
                      className="rounded-lg p-2 text-gray-400 hover:bg-brand-50 hover:text-brand-600"
                      title="Remove sector"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                ))}
                {sectors.length === 0 && (
                  <p className="px-5 py-3 text-sm text-muted">Nothing here yet.</p>
                )}
              </Card>
            </div>
          );
        })}
      </div>
    </>
  );
}

const DIRECTION_HEADING: Record<string, string> = {
  outbound: "Departure sectors",
  inbound: "Return sectors",
  roundtrip: "Round-trip fares",
};

const cnDirection = (direction: string) =>
  direction === "outbound"
    ? "size-4 shrink-0 text-brand-500"
    : direction === "roundtrip"
      ? "size-4 shrink-0 text-emerald-500"
      : "size-4 shrink-0 rotate-180 text-gray-400";

type AddDirection = "outbound" | "inbound" | "roundtrip";

function AddFlight({ season, onDone }: { season: string; onDone: () => void }) {
  const [direction, setDirection] = useState<AddDirection>("roundtrip");
  const [origin, setOrigin] = useState("");
  const [destination, setDestination] = useState("");
  const [returnFrom, setReturnFrom] = useState("");
  const [airline, setAirline] = useState("");
  const [price, setPrice] = useState(0);
  const [saving, setSaving] = useState(false);

  const isRoundTrip = direction === "roundtrip";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await api.post("/api/admin/flights", {
        season,
        direction,
        origin,
        destination,
        // Only a round-trip has a distinct return leg.
        returnFrom: isRoundTrip ? returnFrom : "",
        airline,
        price,
      });
      toast.success(isRoundTrip ? "Round-trip added" : "Sector added");
      onDone();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not add.");
      setSaving(false);
    }
  }

  return (
    <Card className="p-5">
      <form onSubmit={submit} className="flex flex-wrap items-end gap-3">
        <Field label="Type" className="w-40">
          <Select
            options={[
              { value: "roundtrip", label: "Round trip" },
              { value: "outbound", label: "Departure" },
              { value: "inbound", label: "Return" },
            ]}
            value={direction}
            onChange={(e) => setDirection(e.target.value as AddDirection)}
          />
        </Field>
        <Field label={isRoundTrip ? "Home city" : "From"} className="w-36">
          <Input value={origin} onChange={(e) => setOrigin(e.target.value)} placeholder="Karachi" required />
        </Field>
        <Field label={isRoundTrip ? "Fly into" : "To"} className="w-36">
          <Input value={destination} onChange={(e) => setDestination(e.target.value)} placeholder="Jeddah" required />
        </Field>
        {isRoundTrip && (
          <Field label="Return from" hint="blank = same city" className="w-36">
            <Input
              value={returnFrom}
              onChange={(e) => setReturnFrom(e.target.value)}
              placeholder="Jeddah"
            />
          </Field>
        )}
        <Field label="Airline" className="w-36">
          <Input value={airline} onChange={(e) => setAirline(e.target.value)} placeholder="PIA" />
        </Field>
        <Field label="Fare" className="w-36">
          <NumberInput min={0} value={price} onChange={setPrice} required />
        </Field>
        <Button type="submit" loading={saving} disabled={!origin || !destination}>
          Add
        </Button>
      </form>
    </Card>
  );
}
