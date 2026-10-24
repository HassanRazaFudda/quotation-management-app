"use client";

import { formatMoney, roundOffSuggestions } from "@junaidi/shared";

import { Field, NumberInput } from "@/components/ui";
import { cn } from "@/lib/cn";

/**
 * Round the net price to a tidy figure. It suggests the nearest thousand either
 * side - a chip that both shows the resulting total and applies the signed step
 * - and takes any custom amount too. The adjustment is internal, like the
 * discount; only the rounded final reaches the quotation.
 */
export function RoundOffField({
  net,
  value,
  onChange,
  currency,
  step,
}: {
  net: number;
  value: number;
  onChange: (value: number) => void;
  currency: { code: string; symbol: string; decimals: number };
  step: number;
}) {
  const { down, up } = roundOffSuggestions(net, step);
  const money = (v: number) => formatMoney(v, currency);
  const final = Math.max(0, net + value);

  const chip = (delta: number) =>
    delta === 0 ? null : (
      <button
        type="button"
        onClick={() => onChange(delta)}
        className={cn(
          "rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors hover:border-brand-300",
          value === delta ? "border-brand-400 bg-brand-50 text-brand-700" : "border-line bg-white text-ink",
        )}
      >
        {money(net + delta)}
        <span className="ml-1 text-muted">
          ({delta > 0 ? "+" : "−"}
          {Math.abs(delta).toLocaleString("en-US")})
        </span>
      </button>
    );

  return (
    <Field label={`Round off in ${currency.code} (not shown on the quotation)`}>
      <div className="space-y-2">
        <p className="text-xs text-muted">
          Net {money(net)} · shows as <strong className="text-ink">{money(final)}</strong>
        </p>
        {(down !== 0 || up !== 0) && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-muted">Round to:</span>
            {chip(down)}
            {chip(up)}
            {value !== 0 && (
              <button
                type="button"
                onClick={() => onChange(0)}
                className="text-xs text-muted underline hover:text-ink"
              >
                clear
              </button>
            )}
          </div>
        )}
        <NumberInput
          value={value}
          onChange={onChange}
          min={-Math.round(net)}
          fallback={0}
          placeholder="0 (+ to add, − to subtract)"
          className="w-full"
        />
      </div>
    </Field>
  );
}
