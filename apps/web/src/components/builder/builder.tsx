"use client";

import { formatPrice, nextBlockOptions, sharingWordsFor } from "@junaidi/shared";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Check, CheckCircle2, Pencil, Plus, RefreshCw, Wand2 } from "lucide-react";

import {
  Button,
  Card,
  CardHeader,
  Field,
  Input,
  NumberInput,
  RadioGroup,
  Textarea,
} from "@/components/ui";
import { toast } from "@/components/toast";
import { cn } from "@/lib/cn";
import { api, ApiError } from "@/lib/api";
import type { Quotation } from "@/lib/types";
import { autoPackageTitle, computeLocal, toApiPayload, useBuilderStore } from "@/stores/builder";
import { servicesByCategory, useConfigStore } from "@/stores/config";
import { FlightSection } from "./flight-section";
import { PdfPreview } from "./pdf-preview";
import { StayRow } from "./stay-row";

export function Builder({ editing }: { editing?: Quotation }) {
  const router = useRouter();
  const config = useConfigStore();
  const builder = useBuilderStore();
  const [saving, setSaving] = useState(false);
  const initialised = useRef(false);

  useEffect(() => {
    config.load();
  }, [config]);

  // Seed the form once the config is available.
  useEffect(() => {
    if (initialised.current || !config.loaded) return;
    initialised.current = true;

    const defaults = (cat: string) =>
      servicesByCategory(config, cat).filter((s) => s.defaultSelected).map((s) => s.id);

    if (editing) {
      builder.reset({
        quotationId: editing._id,
        packageCategory: editing.packageCategory,
        withoutMina: editing.withoutMina,
        qurbaniIncluded: editing.qurbaniIncluded,
        guestName: editing.guest.name,
        pax: editing.guest.pax,
        date: editing.date.slice(0, 10),
        validUntil: editing.validUntil?.slice(0, 10) ?? "",
        packageTitle: editing.packageTitle,
        packageTitleEdited: true,
        itineraryComplete: true,
        includesNote: editing.includesNote,
        remarks: editing.remarks,
        discount: editing.discount,
        discountNote: editing.discountNote,
        manualTotal: editing.manualOverride ? editing.finalTotal : null,
        flight: {
          included: editing.flight?.included ?? false,
          returnRequired: editing.flight?.returnRequired ?? true,
          outboundId: null,
          inboundId: null,
        },
      });
      for (const stay of editing.stays) {
        builder.addStay({
          blockId: stay.blockId,
          locationId: stay.locationId,
          accommodationId: stay.accommodationId,
          roomType: stay.roomType,
          occupancy: stay.occupancy,
          sharingWord: stay.sharingWord,
        });
      }
      builder.set("itineraryComplete", true);
    } else {
      builder.reset();
      builder.set("includeIds", defaults("includes"));
      builder.set("requirementIds", defaults("requirements"));
      builder.set("termIds", defaults("terms"));
      builder.set("minaServiceIds", defaults("minaServices"));
      builder.set("arafatServiceIds", defaults("arafatServices"));
      // Start on the first category and the first Mina tier.
      const firstCategory = config.packageCategories[0];
      if (firstCategory) builder.set("packageCategory", firstCategory.label);
      const firstMina = minaOptions(config, firstCategory?.label)[0];
      if (firstMina) {
        builder.set("minaAccommodationId", firstMina.id);
        builder.set("withoutMina", Boolean(firstMina.withoutMina));
      }
    }
  }, [config.loaded, editing, builder, config]);

  const result = useMemo(() => computeLocal(builder, config), [builder, config]);

  // Keep the title assembled unless the staff member has typed their own.
  const suggestedTitle = autoPackageTitle(builder, config, result.totalNights);
  useEffect(() => {
    if (!builder.packageTitleEdited && builder.packageTitle !== suggestedTitle) {
      builder.set("packageTitle", suggestedTitle);
    }
  }, [suggestedTitle, builder]);

  // The Mina option chosen at the top governs the Hajj stay — including
  // "Without Mina", which is an option like any other.
  useEffect(() => {
    if (!builder.minaAccommodationId) return;
    for (const stay of builder.stays) {
      const location = config.locations.find((l) => l.id === stay.locationId);
      if (location?.type === "mina" && stay.accommodationId !== builder.minaAccommodationId) {
        builder.updateStay(stay.key, {
          accommodationId: builder.minaAccommodationId,
          mealId: null,
          mealNoteId: null,
        });
      }
    }
  }, [builder.minaAccommodationId, builder.stays, builder, config]);

  /**
   * Categories do not all sell the same Mina options, so changing the category
   * can strand the current choice. Fall back to the first one it does offer.
   */
  useEffect(() => {
    const allowed = minaOptions(config, builder.packageCategory);
    if (allowed.length === 0) return;
    if (allowed.some((m) => m.id === builder.minaAccommodationId)) return;
    chooseMina(allowed[0]!.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [builder.packageCategory, config.accommodations, config.packageCategories]);

  /** Keep the "no tent booked" flag in step with the option chosen. */
  function chooseMina(accommodationId: string) {
    builder.set("minaAccommodationId", accommodationId);
    const chosen = config.accommodations.find((a) => a.id === accommodationId);
    builder.set("withoutMina", Boolean(chosen?.withoutMina));
  }

  const errors = result.issues.filter((i) => i.severity === "error");
  const warnings = result.issues.filter((i) => i.severity === "warning");
  const hajjMismatch = result.issues.find((i) => i.code === "HAJJ_BLOCK_MISALIGNED");
  const canFixHajj = Boolean(hajjMismatch && result.suggestedHajjBlockId);

  /**
   * Which blocks a row may offer.
   *
   * The itinerary is a chain, so a row continues from the rows BEFORE it — not
   * from every other row. Its own current block is always kept in the list;
   * otherwise adding a later stay would leave this row holding a value its
   * dropdown no longer contains, and the browser would silently fall back to
   * the first option.
   */
  const optionsForRow = (index: number) => {
    const earlier = builder.stays
      .slice(0, index)
      .map((s) => s.blockId)
      .filter(Boolean);

    const options = nextBlockOptions(earlier, config.blocks);

    const current = builder.stays[index]?.blockId;
    if (current && !options.some((b) => b.id === current)) {
      const own = config.blocks.find((b) => b.id === current);
      if (own) return [own, ...options];
    }
    return options;
  };

  const canComplete = builder.stays.length > 0 && errors.length === 0;

  function fixHajjBlock() {
    const suggested = config.blocks.find((b) => b.id === result.suggestedHajjBlockId);
    if (!suggested) return;
    const hajjRow = builder.stays.find(
      (s) => config.blocks.find((b) => b.id === s.blockId)?.phase === "hajj",
    );
    if (hajjRow) {
      builder.updateStay(hajjRow.key, { blockId: suggested.id });
      toast.success(`Hajj block set to ${suggested.label}`);
    }
  }

  async function save() {
    if (!builder.guestName.trim()) {
      toast.error("Guest name is required.");
      return;
    }
    if (errors.length > 0 || result.flightIssues.length > 0) {
      toast.error("Fix the highlighted problems first.");
      return;
    }
    setSaving(true);
    try {
      const payload = toApiPayload(builder, config.season);
      const saved = builder.quotationId
        ? await api.patch<Quotation>(`/api/quotations/${builder.quotationId}`, payload)
        : await api.post<Quotation>("/api/quotations", payload);
      toast.success(`Saved ${saved.quotationId}`);
      router.push(`/quotations/${saved._id}`);
    } catch (err) {
      if (err instanceof ApiError && err.fieldErrors.length > 0) toast.error(err.fieldErrors[0]!);
      else toast.error(err instanceof ApiError ? err.message : "Could not save.");
      setSaving(false);
    }
  }

  /**
   * Pull the latest configuration without touching the form.
   *
   * When the admin changes rates, hotels or flights mid-quotation, the staff
   * member would otherwise have to reload the page and lose everything typed.
   * This re-fetches only the config store; the builder state is untouched and
   * the totals recompute against the new numbers.
   */
  async function refreshConfig() {
    await config.load(undefined, true);
    toast.success("Latest rates and options loaded");
  }

  if (config.loading && !config.loaded) {
    return <div className="p-8 text-muted">Loading configuration…</div>;
  }

  const minaChoices = minaOptions(config, builder.packageCategory);

  return (
    <div className="grid gap-5 p-5 lg:grid-cols-[1fr_26rem] lg:p-8">
      <div className="min-w-0 space-y-5">
        <div className="flex items-center justify-end">
          <Button
            variant="secondary"
            size="sm"
            icon={<RefreshCw className={cn("size-4", config.loading && "animate-spin")} />}
            loading={config.loading}
            onClick={refreshConfig}
          >
            Refresh config
          </Button>
        </div>

        {/* ---------------- package ---------------- */}
        <Card>
          <CardHeader title="Package" />
          <div className="space-y-5 p-5">
            <div>
              <p className="mb-2 text-sm text-muted">Maktab category</p>
              <RadioGroup
                options={config.packageCategories.map((c) => ({
                  value: c.label,
                  label: shortCategory(c.label),
                }))}
                value={builder.packageCategory}
                onChange={(v) => builder.set("packageCategory", v)}
              />
            </div>

            <div>
              <p className="mb-2 text-sm text-muted">Mina</p>
              {/* "Without Mina" is one of these options, not a separate mode:
                  it books no tent but still carries the Muallim and transport
                  charge, so it has its own rate per block. */}
              <RadioGroup
                options={minaChoices.map((m) => ({
                  value: m.id,
                  label: m.withoutMina ? "Without Mina" : m.name.replace(/^Mina\s+/, ""),
                  hint: m.bedsPerTent ? `${m.bedsPerTent} beds` : undefined,
                }))}
                value={builder.minaAccommodationId}
                onChange={(v) => chooseMina(v)}
              />
              {minaChoices.length === 0 && (
                <p className="text-sm text-brand-600">
                  No Mina option is available for this category yet.
                </p>
              )}
            </div>
          </div>
        </Card>

        {/* ---------------- guest ---------------- */}
        <Card>
          <CardHeader title="Guest & Dates" />
          <div className="grid gap-4 p-5 sm:grid-cols-2">
            <Field label="Guest name">
              <Input
                value={builder.guestName}
                onChange={(e) => builder.set("guestName", e.target.value)}
                placeholder="Rashid Shahid"
              />
            </Field>
            <Field
              label="PAX"
              hint={paxHint(builder.pax)}
            >
              <NumberInput
                min={1}
                fallback={1}
                value={builder.pax}
                onChange={(v) => builder.set("pax", v)}
              />
            </Field>
            <Field label="Date">
              <Input type="date" value={builder.date} onChange={(e) => builder.set("date", e.target.value)} />
            </Field>
            <Field label="Valid until">
              <Input
                type="date"
                value={builder.validUntil}
                onChange={(e) => builder.set("validUntil", e.target.value)}
              />
            </Field>

            <Field
              label="Package title"
              className="sm:col-span-2"
              hint={
                builder.packageTitleEdited
                  ? "Edited by hand — it will not update itself."
                  : "Built from the season, category and the finished itinerary."
              }
            >
              <div className="flex gap-2">
                <Input
                  value={builder.packageTitle}
                  readOnly={!builder.packageTitleEdited}
                  onChange={(e) => builder.set("packageTitle", e.target.value)}
                  className={cn(!builder.packageTitleEdited && "bg-canvas text-muted")}
                />
                <Button
                  variant="secondary"
                  icon={<Pencil className="size-4" />}
                  onClick={() => builder.set("packageTitleEdited", !builder.packageTitleEdited)}
                >
                  {builder.packageTitleEdited ? "Auto" : "Edit"}
                </Button>
              </div>
            </Field>
          </div>
        </Card>

        {/* ---------------- itinerary ---------------- */}
        <Card>
          <CardHeader
            title="Itinerary"
            subtitle="Each stay continues from the last — only the blocks that follow are offered"
          />
          <div className="space-y-2 p-5">
            {builder.stays.length === 0 && (
              <p className="rounded-lg border border-dashed border-line py-8 text-center text-sm text-muted">
                No stays yet. Add the first one below.
              </p>
            )}

            {builder.stays.map((stay, index) => {
              const stayInvalid = errors.some(
                (e) => e.stayIndex !== undefined && builder.stays[e.stayIndex]?.key === stay.key,
              );
              return (
                <StayRow
                  key={stay.key}
                  stay={stay}
                  blockOptions={optionsForRow(index)}
                  nights={result.perStayNights[stay.key]}
                  lineTotal={result.perStayTotal[stay.key]}
                  invalid={stayInvalid}
                />
              );
            })}

            <div className="flex flex-wrap items-center gap-2 pt-1">
              <Button variant="soft" size="sm" icon={<Plus className="size-4" />} onClick={() => builder.addStay()}>
                Add Stay
              </Button>
              {canFixHajj && (
                <Button
                  variant="secondary"
                  size="sm"
                  icon={<Wand2 className="size-4" />}
                  onClick={fixHajjBlock}
                  className="border-amber-300 text-amber-700"
                >
                  Fix Hajj block
                </Button>
              )}

              <div className="ml-auto flex items-center gap-3">
                <span className="text-sm text-muted">
                  {result.totalNights} nights
                  {result.totalNights > 0 && ` · ${result.totalNights + 1} days`}
                </span>
                <Button
                  size="sm"
                  variant={builder.itineraryComplete ? "secondary" : "primary"}
                  icon={<Check className="size-4" />}
                  disabled={!canComplete}
                  onClick={() => builder.set("itineraryComplete", !builder.itineraryComplete)}
                >
                  {builder.itineraryComplete ? "Reopen" : "Complete"}
                </Button>
              </div>
            </div>

            {(errors.length > 0 || warnings.length > 0) && (
              <div className="space-y-1.5 pt-2">
                {errors.map((issue, i) => (
                  <IssueLine key={`e${i}`} tone="error" message={issue.message} />
                ))}
                {warnings.map((issue, i) => (
                  <IssueLine key={`w${i}`} tone="warn" message={issue.message} />
                ))}
              </div>
            )}
            {builder.itineraryComplete && errors.length === 0 && (
              <div className="flex items-center gap-2 pt-2 text-sm text-ok">
                <CheckCircle2 className="size-4" />
                Itinerary complete — {result.totalNights + 1} days.
              </div>
            )}
          </div>
        </Card>

        {/* ---------------- flights (after the itinerary is settled) ------- */}
        {builder.itineraryComplete && <FlightSection issues={result.flightIssues} />}

        {/* ---------------- pricing ---------------- */}
        <Card>
          <CardHeader title="Pricing" />
          <div className="grid gap-5 p-5 sm:grid-cols-2">
            <div className="space-y-4">
              <label className="flex cursor-pointer items-center gap-2 text-sm text-ink">
                <input
                  type="checkbox"
                  checked={builder.qurbaniIncluded}
                  onChange={(e) => builder.set("qurbaniIncluded", e.target.checked)}
                  className="size-4 accent-brand-500"
                />
                Qurbani included
              </label>

              <Field label="Discount (not shown on the quotation)">
                <NumberInput
                  min={0}
                  value={builder.discount}
                  onChange={(v) => builder.set("discount", v)}
                  placeholder="0"
                />
              </Field>
              {builder.discount > 0 && (
                <Input
                  value={builder.discountNote}
                  onChange={(e) => builder.set("discountNote", e.target.value)}
                  placeholder="Internal note (e.g. repeat customer)"
                />
              )}
            </div>

            <div className="flex flex-col items-end justify-center rounded-lg bg-brand-50 p-5">
              <p className="text-xs font-semibold text-muted">TOTAL PER PERSON</p>
              <p className="text-3xl font-bold text-brand-600">{formatPrice(result.finalTotal)}</p>
              <p className="mt-1 text-xs text-muted">
                {result.totalNights} nights
                {result.flightTotal > 0 && ` · incl. ${formatPrice(result.flightTotal)} air fare`}
              </p>
              {result.discount > 0 && (
                <p className="mt-1 text-xs text-amber-700">
                  after {formatPrice(result.discount)} discount
                </p>
              )}
            </div>
          </div>
        </Card>

        {/* ---------------- services ---------------- */}
        <Card>
          <CardHeader title="Services & Notes" subtitle="Tick what applies to this package" />
          <div className="space-y-5 p-5">
            <ServiceChips label="Extra Services in Mina" category="minaServices" field="minaServiceIds" />
            <ServiceChips label="Extra Services in Arafat" category="arafatServices" field="arafatServiceIds" />
            <div className="grid gap-4 sm:grid-cols-3">
              <ServiceChips label="Price Includes" category="includes" field="includeIds" stacked />
              <ServiceChips label="Visa Requirements" category="requirements" field="requirementIds" stacked />
              <ServiceChips label="Terms & Taxes" category="terms" field="termIds" stacked />
            </div>
            <Field label="Remarks (printed on the quotation)">
              <Textarea
                value={builder.remarks}
                onChange={(e) => builder.set("remarks", e.target.value)}
                placeholder="Rates are subject to availability at the time of confirmation."
              />
            </Field>
          </div>
        </Card>

        <div className="flex justify-end gap-2 pb-8">
          <Button variant="secondary" onClick={() => router.back()}>
            Cancel
          </Button>
          <Button onClick={save} loading={saving} disabled={errors.length > 0}>
            {builder.quotationId ? "Save changes" : "Create quotation"}
          </Button>
        </div>
      </div>

      <div className="hidden lg:block">
        <div className="sticky top-5">
          <PdfPreview canPreview={errors.length === 0 && builder.stays.length > 0} />
        </div>
      </div>
    </div>
  );
}

/** Mina tents, in the order the admin set. */
/**
 * The Mina options on offer, including "Without Mina".
 *
 * Some categories never sell some of them, so the admin can limit an option to
 * particular categories; an option with no limit is available to all.
 */
function minaOptions(
  config: ReturnType<typeof useConfigStore.getState>,
  categoryLabel?: string,
) {
  const mina = config.locations.find((l) => l.type === "mina");
  if (!mina) return [];

  const categoryId = config.packageCategories.find((c) => c.label === categoryLabel)?.id;

  return config.accommodations.filter((a) => {
    if (a.locationId !== mina.id) return false;
    const allowed = a.allowedCategories ?? [];
    return allowed.length === 0 || (categoryId ? allowed.includes(categoryId) : false);
  });
}

/**
 * A group that fills whole rooms of one size may have that size printed;
 * anyone else is quoted "Sharing", which is the honest word for a room that
 * might hold five or six.
 */
function paxHint(pax: number): string | undefined {
  const words = sharingWordsFor(pax);
  if (words.length === 0) return undefined;
  return `${words.map((w) => `“${w}”`).join(" / ")} wording is available for shared rooms`;
}

/** "Maktab A Category" -> "A" so the radios stay compact. */
function shortCategory(label: string): string {
  const match = /maktab\s+(\S+)/i.exec(label);
  return match ? match[1]! : label;
}

function IssueLine({ tone, message }: { tone: "error" | "warn"; message: string }) {
  return (
    <div
      className={cn(
        "flex items-start gap-2 rounded-lg px-3 py-2 text-sm",
        tone === "error" ? "bg-brand-50 text-brand-700" : "bg-amber-50 text-amber-800",
      )}
    >
      <AlertTriangle className="mt-0.5 size-4 shrink-0" />
      <span>{message}</span>
    </div>
  );
}

function ServiceChips({
  label,
  category,
  field,
  stacked,
}: {
  label: string;
  category: string;
  field: "minaServiceIds" | "arafatServiceIds" | "includeIds" | "requirementIds" | "termIds";
  stacked?: boolean;
}) {
  const config = useConfigStore();
  const builder = useBuilderStore();
  const items = servicesByCategory(config, category);
  const selected = builder[field];

  if (items.length === 0) return null;

  return (
    <div>
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">{label}</p>
      <div className={cn("flex flex-wrap gap-1.5", stacked && "flex-col")}>
        {items.map((item) => {
          const on = selected.includes(item.id);
          return (
            <button
              key={item.id}
              onClick={() => builder.toggleService(field, item.id)}
              className={cn(
                "rounded-lg border px-2.5 py-1.5 text-left text-xs transition-colors",
                on
                  ? "border-brand-200 bg-brand-50 text-brand-700"
                  : "border-line bg-white text-muted hover:border-gray-300",
              )}
            >
              {item.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
