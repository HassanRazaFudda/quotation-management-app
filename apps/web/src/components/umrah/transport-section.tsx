"use client";

import { UMRAH_TRANSPORT_ROUTES } from "@junaidi/shared";
import { Plus, Trash2 } from "lucide-react";

import { Button, Card, CardHeader, Field, Input, NumberInput, RadioGroup, Select } from "@/components/ui";
import { useUmrahBuilderStore } from "@/stores/umrah-builder";
import { CurrencySelect } from "./fields";

const OTHER = "__other__";

/**
 * Ground transport. The agent adds only the legs this package needs; each is one
 * vehicle with one cost. Whether the cost is inside the per-person price or
 * shown as its own line is chosen per quotation.
 */
export function TransportSection() {
  const { transportLegs, transportDisplay, addLeg, updateLeg, removeLeg, set } = useUmrahBuilderStore();

  return (
    <Card>
      <CardHeader title="Transportation" subtitle="Add only the legs this package needs" />
      <div className="space-y-4 p-5">
        {transportLegs.length === 0 && (
          <p className="rounded-lg border border-dashed border-line py-6 text-center text-sm text-muted">
            No transport added. Add a leg if the package includes it.
          </p>
        )}

        {transportLegs.map((leg) => {
          const known = (UMRAH_TRANSPORT_ROUTES as readonly string[]).includes(leg.route);
          const choice = leg.isCustomRoute ? OTHER : known ? leg.route : "";
          return (
            <div key={leg.key} className="grid grid-cols-2 gap-2 rounded-lg border border-line bg-white p-3 @2xl:grid-cols-12 @2xl:items-end">
              <Field label="Route" className="col-span-2 min-w-0 @2xl:col-span-4">
                <Select
                  options={[
                    ...UMRAH_TRANSPORT_ROUTES.map((route) => ({ value: route, label: route })),
                    { value: OTHER, label: "Other / custom route" },
                  ]}
                  placeholder="Choose a route"
                  value={choice}
                  onChange={(e) => {
                    const value = e.target.value;
                    if (value === OTHER) updateLeg(leg.key, { isCustomRoute: true, route: known ? "" : leg.route });
                    else updateLeg(leg.key, { isCustomRoute: false, route: value });
                  }}
                />
                {leg.isCustomRoute && (
                  <Input
                    className="mt-2"
                    value={leg.route}
                    onChange={(e) => updateLeg(leg.key, { route: e.target.value })}
                    placeholder="e.g. Madinah Airport to Madinah Hotel"
                  />
                )}
              </Field>
              <Field label="Vehicle" className="min-w-0 @2xl:col-span-3">
                <Input
                  value={leg.vehicle}
                  onChange={(e) => updateLeg(leg.key, { vehicle: e.target.value })}
                  placeholder="Private Staria"
                />
              </Field>
              <Field label="Cost for the leg" className="min-w-0 @2xl:col-span-2">
                <NumberInput min={0} step="any" value={leg.cost} onChange={(v) => updateLeg(leg.key, { cost: v })} />
              </Field>
              <Field label="Currency" className="min-w-0 @2xl:col-span-2">
                <CurrencySelect compact value={leg.currencyCode} onChange={(code) => updateLeg(leg.key, { currencyCode: code })} />
              </Field>
              <div className="flex items-end justify-end @2xl:col-span-1">
                <button
                  type="button"
                  onClick={() => removeLeg(leg.key)}
                  className="rounded-lg p-2 text-gray-400 hover:bg-brand-50 hover:text-brand-600"
                  title="Remove transport"
                >
                  <Trash2 className="size-4" />
                </button>
              </div>
            </div>
          );
        })}

        <Button variant="soft" size="sm" icon={<Plus className="size-4" />} onClick={addLeg}>
          Add transport
        </Button>

        {transportLegs.length > 0 && (
          <div className="space-y-2 border-t border-line pt-4">
            <p className="text-sm text-muted">On the quotation, the transport cost is</p>
            <RadioGroup
              options={[
                { value: "included", label: "Included in the per-person price" },
                { value: "separate", label: "Shown as a separate charge" },
              ]}
              value={transportDisplay}
              onChange={(value) => set("transportDisplay", value)}
            />
            <p className="text-xs text-muted">
              {transportDisplay === "included"
                ? "The routes and vehicles are listed; the cost is shared across the guests and is part of each price. Infants do not carry a share."
                : "The routes are listed and the total transport cost is printed as its own line, outside the per-person price."}
            </p>
          </div>
        )}
      </div>
    </Card>
  );
}
