"use client";

import { Plus, Trash2 } from "lucide-react";

import { Button, Card, CardHeader, Field, Input, NumberInput, Select } from "@/components/ui";
import { useUmrahBuilderStore } from "@/stores/umrah-builder";
import { CurrencySelect } from "./fields";

const BASES = [
  { value: "perPerson", label: "Per person" },
  { value: "perInfant", label: "Per infant" },
  { value: "perGroup", label: "Whole group" },
];

/**
 * Anything else the price covers - visa, ziyarat, a handling fee. The amount is
 * added to the price; only the name is printed, under "Price Includes".
 */
export function ChargesSection() {
  const { charges, addCharge, updateCharge, removeCharge } = useUmrahBuilderStore();

  return (
    <Card>
      <CardHeader
        title="Other charges"
        subtitle="Visa, ziyarat... added to the price; only the name is printed, under Price Includes"
      />
      <div className="space-y-3 p-5">
        {charges.length === 0 && (
          <p className="rounded-lg border border-dashed border-line py-6 text-center text-sm text-muted">
            Nothing extra. Add the Umrah visa or any other charge the price includes.
          </p>
        )}

        {charges.map((charge) => (
          <div key={charge.key} className="grid grid-cols-2 gap-2 rounded-lg border border-line bg-white p-3 @2xl:grid-cols-12 @2xl:items-end">
            <Field label="Charge" className="col-span-2 min-w-0 @2xl:col-span-4">
              <Input
                value={charge.label}
                onChange={(e) => updateCharge(charge.key, { label: e.target.value })}
                placeholder="Umrah visa"
              />
            </Field>
            <Field label="Amount" className="min-w-0 @2xl:col-span-2">
              <NumberInput min={0} step="any" value={charge.amount} onChange={(v) => updateCharge(charge.key, { amount: v })} />
            </Field>
            <Field label="Currency" className="min-w-0 @2xl:col-span-2">
              <CurrencySelect compact value={charge.currencyCode} onChange={(code) => updateCharge(charge.key, { currencyCode: code })} />
            </Field>
            <Field label="Charged" className="min-w-0 @2xl:col-span-3">
              <Select
                options={BASES}
                value={charge.basis}
                onChange={(e) => updateCharge(charge.key, { basis: e.target.value as typeof charge.basis })}
              />
            </Field>
            <div className="flex items-end justify-end @2xl:col-span-1">
              <button
                type="button"
                onClick={() => removeCharge(charge.key)}
                className="rounded-lg p-2 text-gray-400 hover:bg-brand-50 hover:text-brand-600"
                title="Remove charge"
              >
                <Trash2 className="size-4" />
              </button>
            </div>
          </div>
        ))}

        <Button variant="soft" size="sm" icon={<Plus className="size-4" />} onClick={addCharge}>
          Add charge
        </Button>
      </div>
    </Card>
  );
}
