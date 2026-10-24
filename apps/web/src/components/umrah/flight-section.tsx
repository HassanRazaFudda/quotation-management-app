"use client";

import { Card, CardHeader, Field, Input, NumberInput, RadioGroup } from "@/components/ui";
import { useUmrahBuilderStore } from "@/stores/umrah-builder";
import { CurrencySelect } from "./fields";

/**
 * Air travel, typed in: there is no fare list for Umrah, so the agent writes the
 * sectors and the fare. Infants fly at their own fare.
 */
export function FlightSection() {
  const { flight, setFlight, infants } = useUmrahBuilderStore();

  return (
    <Card>
      <CardHeader title="Flight" subtitle="Air ticket, if the package includes it" />
      <div className="space-y-4 p-5">
        <RadioGroup
          options={[
            { value: "no", label: "Ticket not included" },
            { value: "yes", label: "Ticket included" },
          ]}
          value={flight.included ? "yes" : "no"}
          onChange={(value) => setFlight({ included: value === "yes" })}
        />

        {flight.included && (
          <div className="grid gap-3 rounded-lg border border-line bg-canvas/50 p-4 @xl:grid-cols-2">
            <Field label="Airline" className="@xl:col-span-2">
              <Input value={flight.airline} onChange={(e) => setFlight({ airline: e.target.value })} placeholder="Emirates" />
            </Field>
            <Field label="Going">
              <Input value={flight.outbound} onChange={(e) => setFlight({ outbound: e.target.value })} placeholder="Karachi - Madinah" />
            </Field>
            <Field label="Return" hint="Leave empty for a one-way ticket">
              <Input value={flight.inbound} onChange={(e) => setFlight({ inbound: e.target.value })} placeholder="Jeddah - Karachi" />
            </Field>
            <Field label="Fare per adult / child">
              <NumberInput min={0} step="any" value={flight.adultFare} onChange={(v) => setFlight({ adultFare: v })} />
            </Field>
            <Field label="Fare per infant" hint={infants === 0 ? "No infants on this quotation" : undefined}>
              <NumberInput min={0} step="any" value={flight.infantFare} onChange={(v) => setFlight({ infantFare: v })} />
            </Field>
            <Field label="Fares in">
              <CurrencySelect value={flight.currencyCode} onChange={(code) => setFlight({ currencyCode: code })} />
            </Field>
          </div>
        )}
      </div>
    </Card>
  );
}
