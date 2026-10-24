"use client";

import type { UmrahIssue } from "@junaidi/shared";
import { AlertTriangle } from "lucide-react";

import { Input, Select } from "@/components/ui";
import { cn } from "@/lib/cn";
import { useConfigStore } from "@/stores/config";

/**
 * A money or rate field that may be left empty - "this hotel has no Triple".
 * `NumberInput` always settles an empty box back to a number; an unset rate
 * must stay unset, because an unset rate and a zero rate mean different things.
 */
export function NullableNumberInput({
  value,
  onChange,
  placeholder,
  className,
}: {
  value: number | null;
  onChange: (value: number | null) => void;
  placeholder?: string;
  className?: string;
}) {
  return (
    <Input
      type="number"
      inputMode="decimal"
      min={0}
      step="any"
      value={value ?? ""}
      placeholder={placeholder}
      className={className}
      onChange={(event) => {
        const raw = event.target.value;
        if (raw === "") return onChange(null);
        const parsed = Number(raw);
        if (Number.isFinite(parsed)) onChange(Math.max(0, parsed));
      }}
    />
  );
}

/** Currencies the agent can price in: PKR, then whatever the admin has enabled, then any already in use. */
export function useCurrencyOptions(
  extraCodes: string[] = [],
  compact = false,
): Array<{ value: string; label: string }> {
  const currencies = useConfigStore((s) => s.currencies);
  const options = [{ value: "PKR", label: compact ? "PKR" : "PKR - Pakistani Rupee" }];
  const seen = new Set(["PKR"]);
  for (const currency of currencies) {
    if (!currency.enabled || seen.has(currency.code)) continue;
    seen.add(currency.code);
    options.push({
      value: currency.code,
      label: compact || !currency.name ? currency.code : `${currency.code} - ${currency.name}`,
    });
  }
  for (const code of extraCodes) {
    const upper = code.toUpperCase();
    if (upper && !seen.has(upper)) {
      seen.add(upper);
      options.push({ value: upper, label: upper });
    }
  }
  return options;
}

/** `compact` shows just the code, for the narrow cells of a row of fields. */
export function CurrencySelect({
  value,
  onChange,
  className,
  compact = false,
}: {
  value: string;
  onChange: (code: string) => void;
  className?: string;
  compact?: boolean;
}) {
  const options = useCurrencyOptions([value], compact);
  return <Select className={className} options={options} value={value} onChange={(e) => onChange(e.target.value)} />;
}

/** The problems under one section of the form; only those whose path starts with `prefix`. */
export function IssueList({ issues, prefix }: { issues: UmrahIssue[]; prefix: string }) {
  const mine = issues.filter((issue) => issue.path === prefix || issue.path.startsWith(`${prefix}.`));
  if (mine.length === 0) return null;
  return (
    <div className="space-y-1.5 pt-1">
      {mine.map((issue, i) => (
        <div
          key={i}
          className={cn(
            "flex items-start gap-2 rounded-lg px-3 py-2 text-sm",
            issue.severity === "error" ? "bg-brand-50 text-brand-700" : "bg-amber-50 text-amber-800",
          )}
        >
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <span>{issue.message}</span>
        </div>
      ))}
    </div>
  );
}
