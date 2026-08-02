"use client";

import { useEffect, useState } from "react";
import { Coins, Plus, Save, Trash2 } from "lucide-react";

import type { Currency } from "@junaidi/shared";

import { PageHeader } from "@/components/app-shell";
import { toast } from "@/components/toast";
import { Button, Card, Field, Input, MoneyInput, NumberInput, Spinner } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { useConfigStore } from "@/stores/config";

/**
 * The currencies a quotation can be priced in.
 *
 * Base rates are PKR; each currency carries how many PKR one of its units costs
 * (1 USD = 280 PKR). PKR is the built-in base and is not listed here. A rate can
 * be changed any time - quotations froze their own rate at save, so they never
 * shift underneath a customer.
 */
export default function CurrenciesPage() {
  const config = useConfigStore();
  const [showAdd, setShowAdd] = useState(false);
  const [rates, setRates] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    config.load();
  }, [config]);

  useEffect(() => {
    if (config.loaded) setRates(Object.fromEntries(config.currencies.map((c) => [c.id, c.rate])));
  }, [config.loaded, config.currencies]);

  async function save(currency: Currency, patch: Partial<Currency>) {
    setBusy(currency.id);
    try {
      await api.post("/api/admin/currencies", {
        id: currency.id,
        season: config.season,
        code: currency.code,
        name: currency.name,
        symbol: currency.symbol,
        rate: rates[currency.id] ?? currency.rate,
        decimals: currency.decimals,
        enabled: currency.enabled,
        ...patch,
      });
      await config.load(undefined, true);
      toast.success("Saved");
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Could not save.");
    } finally {
      setBusy(null);
    }
  }

  async function remove(currency: Currency) {
    setBusy(currency.id);
    try {
      await api.del(`/api/admin/currencies/${currency.id}`);
      await config.load(undefined, true);
      toast.success(`${currency.code} removed`);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Could not remove.");
    } finally {
      setBusy(null);
    }
  }

  if (!config.loaded) return <Spinner label="Loading currencies…" />;

  return (
    <>
      <PageHeader
        title="Currencies"
        subtitle={`Season ${config.season} · exchange rates for pricing a quotation`}
        action={
          <Button icon={<Plus className="size-4" />} onClick={() => setShowAdd((v) => !v)}>
            Add currency
          </Button>
        }
      />

      <div className="space-y-6 p-5 lg:p-8">
        <p className="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Rates are how many <strong>PKR</strong> one unit costs (1 USD = 280 PKR). Base rates stay
          in PKR; a quotation freezes its currency's rate when saved, so changing a rate here never
          alters a quote already made.
        </p>

        {showAdd && (
          <AddCurrency
            season={config.season}
            onDone={() => {
              setShowAdd(false);
              config.load(undefined, true);
            }}
          />
        )}

        <Card className="divide-y divide-line">
          {config.currencies.length === 0 && (
            <p className="px-5 py-4 text-sm text-muted">
              No currencies yet. PKR is always available as the base; add USD, SAR, AED and others
              here.
            </p>
          )}
          {config.currencies.map((c) => (
            <div key={c.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
              <Coins className={`size-4 shrink-0 ${c.enabled ? "text-brand-500" : "text-gray-300"}`} />
              <div className="min-w-0 flex-1">
                <p className="font-medium text-ink">
                  {c.code}
                  {c.name && <span className="ml-2 text-xs font-normal text-muted">{c.name}</span>}
                  {!c.enabled && (
                    <span className="ml-2 rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-gray-500">
                      Disabled
                    </span>
                  )}
                </p>
                <p className="text-xs text-muted">
                  {c.decimals} decimals · symbol {c.symbol || c.code}
                </p>
              </div>

              <label className="flex items-center gap-1 text-xs text-muted">
                1 {c.code} =
                <MoneyInput
                  min={0}
                  value={rates[c.id] ?? c.rate}
                  onChange={(v) => setRates((r) => ({ ...r, [c.id]: v }))}
                  className="h-9 w-28"
                />
                PKR
              </label>

              <Button
                variant={c.enabled ? "ghost" : "secondary"}
                size="sm"
                loading={busy === c.id}
                onClick={() => save(c, { enabled: !c.enabled })}
              >
                {c.enabled ? "Disable" : "Enable"}
              </Button>
              <Button
                size="sm"
                variant="secondary"
                icon={<Save className="size-4" />}
                loading={busy === c.id}
                onClick={() => save(c, {})}
              >
                Save rate
              </Button>
              <button
                onClick={() => remove(c)}
                className="rounded-lg p-2 text-gray-400 hover:bg-brand-50 hover:text-brand-600"
                title="Remove currency"
              >
                <Trash2 className="size-4" />
              </button>
            </div>
          ))}
        </Card>
      </div>
    </>
  );
}

function AddCurrency({ season, onDone }: { season: string; onDone: () => void }) {
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [symbol, setSymbol] = useState("");
  const [rate, setRate] = useState(0);
  const [decimals, setDecimals] = useState(2);
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await api.post("/api/admin/currencies", {
        season,
        code: code.trim().toUpperCase(),
        name: name.trim(),
        symbol: symbol.trim(),
        rate,
        decimals,
        enabled: true,
      });
      toast.success(`${code.trim().toUpperCase()} added`);
      onDone();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not add.");
      setSaving(false);
    }
  }

  return (
    <Card className="p-5">
      <form onSubmit={submit} className="flex flex-wrap items-end gap-3">
        <Field label="Code" className="w-28">
          <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="USD" required />
        </Field>
        <Field label="Name" className="w-44">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="US Dollar" />
        </Field>
        <Field label="Symbol" className="w-24">
          <Input value={symbol} onChange={(e) => setSymbol(e.target.value)} placeholder="$" />
        </Field>
        <Field label="1 unit = PKR" className="w-36">
          <MoneyInput min={0} value={rate} onChange={setRate} />
        </Field>
        <Field label="Decimals" className="w-24">
          <NumberInput min={0} max={4} value={decimals} onChange={setDecimals} fallback={2} />
        </Field>
        <Button type="submit" loading={saving} disabled={!code.trim() || rate <= 0}>
          Add
        </Button>
      </form>
    </Card>
  );
}
