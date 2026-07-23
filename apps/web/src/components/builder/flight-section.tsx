"use client";

import { formatPrice } from "@junaidi/shared";
import { Plane } from "lucide-react";

import { Card, CardHeader, RadioGroup, Select } from "@/components/ui";
import { cn } from "@/lib/cn";
import { useBuilderStore } from "@/stores/builder";
import { useConfigStore } from "@/stores/config";

/**
 * Air travel for the package.
 *
 * Two shapes, because the agency buys tickets both ways:
 *   - Round-trip: one two-way ticket at a single negotiated fare (the common
 *     Pakistani "return ticket", usually cheaper than two one-ways).
 *   - Separate sectors: an outbound and, if wanted, a return - so the guest can
 *     fly into Madinah and home from Jeddah.
 */
export function FlightSection({ issues }: { issues: string[] }) {
  const config = useConfigStore();
  const { flight, setFlight } = useBuilderStore();

  const roundTrips = config.flights.filter((f) => f.direction === "roundtrip");
  const outbound = config.flights.filter((f) => f.direction === "outbound");
  const inbound = config.flights.filter((f) => f.direction === "inbound");

  const mode = flight.roundTrip ? "roundtrip" : "sectors";

  function chooseMode(next: "roundtrip" | "sectors") {
    // Clear the other shape so only one drives the fare.
    if (next === "roundtrip") setFlight({ roundTrip: true, outboundId: null, inboundId: null });
    else setFlight({ roundTrip: false, roundTripId: null });
  }

  const chosenRt = roundTrips.find((f) => f.id === flight.roundTripId);
  const chosenOut = outbound.find((f) => f.id === flight.outboundId);
  const chosenIn = inbound.find((f) => f.id === flight.inboundId);

  const total =
    mode === "roundtrip"
      ? chosenRt?.price ?? 0
      : (chosenOut?.price ?? 0) + (flight.returnRequired ? chosenIn?.price ?? 0 : 0);

  return (
    <Card>
      <CardHeader title="Flights" subtitle="Air ticket, if the package includes it" />
      <div className="space-y-5 p-5">
        <RadioGroup
          options={[
            { value: "no", label: "Flight not included" },
            { value: "yes", label: "Flight included" },
          ]}
          value={flight.included ? "yes" : "no"}
          onChange={(v) =>
            setFlight({
              included: v === "yes",
              // If the agency only sells two-way tickets, start there.
              roundTrip:
                v === "yes" && roundTrips.length > 0 && outbound.length === 0
                  ? true
                  : flight.roundTrip,
            })
          }
        />

        {flight.included && (
          <div className="space-y-4 rounded-lg border border-line bg-canvas/50 p-4">
            <RadioGroup
              options={[
                { value: "roundtrip", label: "Round-trip ticket" },
                { value: "sectors", label: "Separate sectors" },
              ]}
              value={mode}
              onChange={(v) => chooseMode(v as "roundtrip" | "sectors")}
            />

            {mode === "roundtrip" ? (
              <label className="block sm:w-2/3">
                <span className="mb-1.5 block text-sm text-muted">Round-trip fare</span>
                <Select
                  options={roundTrips.map((f) => ({
                    value: f.id,
                    label: `${f.label} — ${formatPrice(f.price)}`,
                  }))}
                  placeholder={roundTrips.length ? "Select a two-way ticket" : "None configured"}
                  value={flight.roundTripId ?? ""}
                  onChange={(e) => setFlight({ roundTripId: e.target.value || null })}
                />
                {chosenRt && (
                  <span className="mt-1 block text-xs text-muted">
                    Both legs, one fare — return from {chosenRt.returnFrom || chosenRt.destination}
                  </span>
                )}
              </label>
            ) : (
              <>
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="block">
                    <span className="mb-1.5 block text-sm text-muted">Departure sector</span>
                    <Select
                      options={outbound.map((f) => ({
                        value: f.id,
                        label: `${f.label} — ${formatPrice(f.price)}`,
                      }))}
                      placeholder="Select departure"
                      value={flight.outboundId ?? ""}
                      onChange={(e) => setFlight({ outboundId: e.target.value || null })}
                    />
                    {chosenOut && (
                      <span className="mt-1 block text-xs text-muted">
                        Arrives in {chosenOut.destination}
                      </span>
                    )}
                  </label>

                  <div>
                    <span className="mb-1.5 block text-sm text-muted">Return ticket</span>
                    <RadioGroup
                      options={[
                        { value: "yes", label: "Return included" },
                        { value: "no", label: "One-way only" },
                      ]}
                      value={flight.returnRequired ? "yes" : "no"}
                      onChange={(v) =>
                        setFlight({
                          returnRequired: v === "yes",
                          inboundId: v === "yes" ? flight.inboundId : null,
                        })
                      }
                    />
                  </div>
                </div>

                {flight.returnRequired && (
                  <label className="block sm:w-1/2 sm:pr-2">
                    <span className="mb-1.5 block text-sm text-muted">Return sector</span>
                    <Select
                      options={inbound.map((f) => ({
                        value: f.id,
                        label: `${f.label} — ${formatPrice(f.price)}`,
                      }))}
                      placeholder="Select return"
                      value={flight.inboundId ?? ""}
                      onChange={(e) => setFlight({ inboundId: e.target.value || null })}
                    />
                    {chosenIn && (
                      <span className="mt-1 block text-xs text-muted">
                        Departs from {chosenIn.origin}
                      </span>
                    )}
                  </label>
                )}
              </>
            )}

            {issues.length > 0 && (
              <div className="space-y-1">
                {issues.map((issue, i) => (
                  <p key={i} className="rounded bg-brand-50 px-2.5 py-1.5 text-xs text-brand-700">
                    {issue}
                  </p>
                ))}
              </div>
            )}

            <div
              className={cn(
                "flex items-center justify-between rounded-lg px-4 py-3",
                total > 0 ? "bg-white" : "bg-transparent",
              )}
            >
              <span className="flex items-center gap-2 text-sm text-muted">
                <Plane className="size-4" />
                Air fare per person
              </span>
              <span className="text-lg font-bold text-ink">{formatPrice(total)}</span>
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}
