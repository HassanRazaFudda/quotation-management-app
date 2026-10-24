"use client";

import { formatMoney, UMRAH_TIERS, type UmrahLineKey, type UmrahPricing } from "@junaidi/shared";

import { RoundOffField } from "@/components/round-off-field";
import { Card, CardHeader, Field, Input, NumberInput, RadioGroup } from "@/components/ui";
import { cn } from "@/lib/cn";
import { useConfigStore } from "@/stores/config";
import {
  convertLineControls,
  usedCurrencyCodes,
  useUmrahBuilderStore,
  type UmrahBuilderCurrency,
} from "@/stores/umrah-builder";
import { CurrencySelect, NullableNumberInput } from "./fields";

/**
 * Currency, exchange rates and the price itself.
 *
 * Rates are prefilled from the app's currency list but belong to this
 * quotation: changing one here changes nothing anywhere else, and the rate used
 * is frozen on the quotation when it is saved. Every printed price has the same
 * internal controls - discount, round-off, or a typed price - none of which is
 * ever printed.
 */
export function PricingSection({ pricing }: { pricing: UmrahPricing }) {
  const state = useUmrahBuilderStore();
  const config = useConfigStore();
  const { currency, exchangeRates, pricingMode, priceDisplay, withoutBedPax, lines, setLine } = state;

  const money = (value: number) => formatMoney(value, currency);
  const codes = usedCurrencyCodes(state);

  /** PKR per unit: the quotation's own rate, else the app's currency list. */
  const rateFor = (code: string): number => {
    if (code === "PKR") return 1;
    return exchangeRates[code] ?? config.currencies.find((c) => c.code === code)?.rate ?? 0;
  };

  function changeCurrency(code: string) {
    if (code === currency.code) return;
    const known = config.currencies.find((c) => c.code === code);
    const next: UmrahBuilderCurrency =
      code === "PKR"
        ? { code: "PKR", symbol: "PKR", decimals: 0 }
        : { code, symbol: known?.symbol || code, decimals: known?.decimals ?? 2 };
    state.set("lines", convertLineControls(lines, rateFor(currency.code), rateFor(code), next.decimals));
    state.set("currency", next);
  }

  const lineKeys: UmrahLineKey[] =
    pricingMode === "tiered" ? [...UMRAH_TIERS, "withoutBed", "infant"] : ["main", "withoutBed", "infant"];
  const printed = new Map(pricing.lines.map((line) => [line.key, line]));
  const hasDiscount = pricing.lines.some((line) => line.discount > 0);

  return (
    <Card>
      <CardHeader title="Pricing" />
      <div className="space-y-5 p-5">
        <div className="grid gap-4 @xl:grid-cols-2">
          <Field label="Show the price in">
            <CurrencySelect value={currency.code} onChange={changeCurrency} />
          </Field>
          {pricingMode !== "tiered" && withoutBedPax > 0 && (
            <div>
              <p className="mb-1.5 text-sm text-muted">Price for guests with and without a bed</p>
              <RadioGroup
                options={[
                  { value: "breakdown", label: "Separate prices" },
                  { value: "average", label: "One average price" },
                ]}
                value={priceDisplay}
                onChange={(value) => state.set("priceDisplay", value)}
              />
            </div>
          )}
        </div>

        {codes.length > 0 && (
          <div className="rounded-lg border border-line bg-canvas/50 p-4">
            <p className="mb-2 text-sm font-medium text-ink">Exchange rates</p>
            <div className="grid gap-3 @xl:grid-cols-2">
              {codes.map((code) => (
                <div key={code} className="flex items-center gap-2 text-sm text-muted">
                  <span className="w-16 shrink-0 text-right">1 {code} =</span>
                  <NumberInput
                    min={0}
                    step="any"
                    value={exchangeRates[code] ?? 0}
                    onChange={(value) => state.set("exchangeRates", { ...exchangeRates, [code]: value })}
                    className={cn((exchangeRates[code] ?? 0) <= 0 && "border-brand-300")}
                  />
                  <span>PKR</span>
                </div>
              ))}
            </div>
            <p className="mt-2 text-xs text-muted">
              Prefilled from the currency list. Changing a rate here changes this quotation only, and it is saved with
              the quotation.
            </p>
          </div>
        )}

        <div className="space-y-3">
          {lineKeys.map((key) => {
            const control = lines[key];
            const line = printed.get(key);
            const isTier = (UMRAH_TIERS as readonly string[]).includes(key);
            if (!line && !isTier) return null;

            return (
              <div
                key={key}
                className={cn(
                  "rounded-lg border p-4",
                  control.offered || !isTier ? "border-line bg-white" : "border-dashed border-line bg-canvas/50",
                )}
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="font-medium text-ink">{line ? line.label : key}</p>
                    {line && (
                      <p className="text-xs text-muted">
                        per person · {line.count} {line.count === 1 ? "guest" : "guests"}
                        {pricing.tierIncomplete[key as keyof typeof pricing.tierIncomplete] &&
                          " · a hotel has no rate for this room type"}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-4">
                    {isTier && (
                      <label className="flex cursor-pointer items-center gap-2 text-sm text-ink">
                        <input
                          type="checkbox"
                          checked={control.offered}
                          onChange={(e) => setLine(key, { offered: e.target.checked })}
                          className="size-4 accent-brand-500"
                        />
                        Offer this room type
                      </label>
                    )}
                    {line && (
                      <p className="text-right text-xl font-bold text-brand-600">
                        {money(line.finalTotal)}
                        {line.manualOverride && <span className="ml-1.5 text-xs font-medium text-muted">typed</span>}
                      </p>
                    )}
                  </div>
                </div>

                {line && (
                  <div className="mt-4 grid gap-4 @xl:grid-cols-2">
                    <Field label={`Calculated price (${currency.code})`}>
                      <div className="flex h-10 items-center rounded-lg border border-line bg-canvas px-3 text-sm text-ink">
                        {money(line.subtotal)}
                      </div>
                    </Field>
                    <Field label={`Type a price instead (${currency.code})`} hint="Replaces the calculation">
                      <NullableNumberInput
                        value={control.manualTotal}
                        placeholder="use the calculated price"
                        onChange={(value) => setLine(key, { manualTotal: value })}
                      />
                    </Field>
                    {control.manualTotal === null && (
                      <>
                        <Field label={`Discount in ${currency.code} (not shown on the quotation)`}>
                          <NumberInput
                            min={0}
                            step="any"
                            value={control.discount}
                            onChange={(value) => setLine(key, { discount: value })}
                            placeholder="0"
                          />
                        </Field>
                        <RoundOffField
                          net={line.subtotal - line.discount}
                          value={control.roundOff}
                          onChange={(value) => setLine(key, { roundOff: value })}
                          currency={currency}
                          step={currency.code === "PKR" ? 1000 : 1}
                        />
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {hasDiscount && (
          <Input
            value={state.discountNote}
            onChange={(e) => state.set("discountNote", e.target.value)}
            placeholder="Internal note about the discount (e.g. repeat customer)"
          />
        )}

        {pricingMode !== "tiered" && pricing.lines.length > 0 && !pricing.hasErrors && (
          <div className="rounded-lg bg-brand-50 p-4 text-right">
            <p className="text-xs font-semibold text-muted">WHOLE BOOKING</p>
            <p className="text-2xl font-bold text-brand-600">{money(pricing.grandTotal)}</p>
            <p className="mt-0.5 text-xs text-muted">
              {pricing.totalNights} nights
              {state.transportDisplay === "separate" && pricing.transportTotal > 0
                ? ` · includes ${money(pricing.transportTotal)} transportation, charged separately`
                : ""}
            </p>
          </div>
        )}
        {pricingMode === "tiered" && (
          <p className="rounded-lg bg-canvas p-3 text-xs text-muted">
            A quotation with separate room-type prices cannot be confirmed as a booking. Once the customer chooses a
            room type, switch the quotation to a single room type or Family and confirm it.
          </p>
        )}
      </div>
    </Card>
  );
}
