"use client";

import type { UmrahPricingMode } from "@junaidi/shared";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { Plus } from "lucide-react";

import { PdfPreviewFrame } from "@/components/pdf-preview-frame";
import { toast } from "@/components/toast";
import { Button, Card, CardHeader, Field, Input, NumberInput, RadioGroup, Spinner, Textarea } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import type { UmrahQuotation, UmrahSettings } from "@/lib/umrah-types";
import { useConfigStore } from "@/stores/config";
import {
  builderDataFromDefaults,
  builderDataFromQuotation,
  computeUmrah,
  toUmrahPayload,
  usedCurrencyCodes,
  useUmrahBuilderStore,
} from "@/stores/umrah-builder";
import { ChargesSection } from "./charges-section";
import { IssueList } from "./fields";
import { FlightSection } from "./flight-section";
import { PricingSection } from "./pricing-section";
import { StayRow } from "./stay-row";
import { TransportSection } from "./transport-section";

const MODES: Array<{ value: UmrahPricingMode; label: string; hint: string }> = [
  { value: "single", label: "One room type", hint: "every guest in the same kind of room" },
  { value: "family", label: "Family", hint: "a mix of room types" },
  { value: "tiered", label: "Room types", hint: "Quad / Triple / Double prices side by side" },
];

const ROOM_SUGGESTIONS = ["Quad", "Triple", "Double", "Single", "Suite", "Family Room"];

/**
 * The Umrah quotation form: guests, hotels, transport, flight, other charges
 * and the price. Every rate is typed in; the price recalculates as you go and
 * the server prices it again, the same way, on save.
 */
export function UmrahBuilder({
  editing,
  duplicateFrom,
}: {
  /** Edit this quotation; save updates it. */
  editing?: UmrahQuotation;
  /** Start a fresh draft from this one; save creates a new quotation. */
  duplicateFrom?: UmrahQuotation;
}) {
  const router = useRouter();
  const config = useConfigStore();
  const builder = useUmrahBuilderStore();
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const started = useRef(false);

  useEffect(() => {
    config.load();
  }, [config]);

  // Start the form once: from a saved quotation, or blank with the admin's default text.
  useEffect(() => {
    if (started.current) return;
    started.current = true;

    const source = editing ?? duplicateFrom;
    if (source) {
      builder.reset(builderDataFromQuotation(source, editing ? "edit" : "duplicate"));
      setReady(true);
      return;
    }
    api
      .get<UmrahSettings>("/api/umrah-settings")
      .then((settings) => builder.reset(builderDataFromDefaults(settings.defaults)))
      .catch(() => builder.reset())
      .finally(() => setReady(true));
  }, [builder, editing, duplicateFrom]);

  // Prefill the exchange rate of any currency newly in use from the app's currency
  // list. Only a currency with no rate yet is filled - a rate the agent changed,
  // or one saved on the quotation, is never overwritten.
  const codes = usedCurrencyCodes(builder).join(",");
  useEffect(() => {
    if (!ready || !config.loaded) return;
    const missing = codes
      .split(",")
      .filter((code) => code && builder.exchangeRates[code] === undefined)
      .map((code) => [code, config.currencies.find((c) => c.code === code)?.rate] as const)
      .filter((entry): entry is readonly [string, number] => typeof entry[1] === "number");
    if (missing.length > 0) {
      builder.set("exchangeRates", { ...builder.exchangeRates, ...Object.fromEntries(missing) });
    }
  }, [ready, codes, config.loaded, config.currencies, builder]);

  const pricing = useMemo(() => computeUmrah(builder), [builder]);
  const errors = pricing.issues.filter((issue) => issue.severity === "error");

  // A form nobody has touched yet is incomplete, not wrong: keep Save disabled
  // but do not greet the agent with a wall of red.
  const untouched =
    !builder.guestName.trim() &&
    builder.stays.every((stay) => !stay.city && !stay.hotelName && !stay.checkIn && !stay.checkOut) &&
    builder.transportLegs.length === 0 &&
    builder.charges.length === 0;
  const issues = untouched ? [] : pricing.issues;

  const defaultTitle = pricing.totalNights > 0 ? `Umrah Package - ${pricing.totalNights} Nights` : "";

  /** The payload as it will be saved; an unset title falls back to the nights. */
  function payload() {
    const body = toUmrahPayload(builder);
    return { ...body, packageTitle: body.packageTitle.trim() || defaultTitle };
  }

  function changeMode(next: UmrahPricingMode) {
    if (next === builder.pricingMode) return;
    // Leaving "one room type", each hotel's room line starts seating the whole party.
    if (builder.pricingMode === "single" && next === "family") {
      builder.set(
        "stays",
        builder.stays.map((stay) => ({
          ...stay,
          rooms: stay.rooms.map((room, i) => (i === 0 ? { ...room, persons: builder.pax } : room)),
        })),
      );
    }
    builder.set("pricingMode", next);
  }

  async function save() {
    if (!builder.guestName.trim()) {
      toast.error("Guest name is required.");
      return;
    }
    if (errors.length > 0) {
      toast.error("Fix the highlighted problems first.");
      return;
    }
    setSaving(true);
    try {
      const saved = builder.quotationId
        ? await api.patch<UmrahQuotation>(`/api/umrah-quotations/${builder.quotationId}`, payload())
        : await api.post<UmrahQuotation>("/api/umrah-quotations", payload());
      toast.success(`Saved ${saved.quotationId}`);
      router.push(`/umrah-quotations/${saved._id}`);
    } catch (err) {
      if (err instanceof ApiError && err.fieldErrors.length > 0) toast.error(err.fieldErrors[0]!);
      else toast.error(err instanceof ApiError ? err.message : "Could not save.");
      setSaving(false);
    }
  }

  if (!ready) return <Spinner label="Loading…" />;

  const previewBody = JSON.stringify({
    ...payload(),
    guest: { ...toUmrahPayload(builder).guest, name: builder.guestName.trim() || "Guest Name" },
  });

  return (
    <div className="grid gap-5 p-5 lg:p-8 xl:grid-cols-[1fr_26rem]">
      <datalist id="umrah-room-types">
        {ROOM_SUGGESTIONS.map((room) => (
          <option key={room} value={room} />
        ))}
      </datalist>

      <div className="@container min-w-0 space-y-5">
        {/* ---------------- quote type ---------------- */}
        <Card>
          <CardHeader title="Quotation type" subtitle="How the price is built and shown to the customer" />
          <div className="space-y-2 p-5">
            <RadioGroup
              options={MODES.map((m) => ({ value: m.value, label: m.label }))}
              value={builder.pricingMode}
              onChange={changeMode}
            />
            <p className="text-xs text-muted">{MODES.find((m) => m.value === builder.pricingMode)?.hint}</p>
          </div>
        </Card>

        {/* ---------------- guests ---------------- */}
        <Card>
          <CardHeader title="Guests & dates" />
          <div className="grid gap-4 p-5 @xl:grid-cols-2">
            <Field label="Guest name" className="@xl:col-span-2">
              <Input
                value={builder.guestName}
                onChange={(e) => builder.set("guestName", e.target.value)}
                placeholder="Rashid Shahid"
              />
            </Field>
            <Field label="Guests with a bed" hint="Adults and children who have their own bed">
              <NumberInput min={1} fallback={1} value={builder.pax} onChange={(v) => builder.set("pax", Math.round(v))} />
            </Field>
            <Field label="Guests without a bed" hint="Share a room, no extra bed - any age">
              <NumberInput min={0} value={builder.withoutBedPax} onChange={(v) => builder.set("withoutBedPax", Math.round(v))} />
            </Field>
            <Field label="Infants" hint="Own flight fare; no room or transport share">
              <NumberInput min={0} value={builder.infants} onChange={(v) => builder.set("infants", Math.round(v))} />
            </Field>
            <Field label="Quotation date">
              <Input type="date" value={builder.date} onChange={(e) => builder.set("date", e.target.value)} />
            </Field>
            <Field label="Valid until">
              <Input type="date" value={builder.validUntil} onChange={(e) => builder.set("validUntil", e.target.value)} />
            </Field>
            <Field label="Package title" hint="Leave empty to use the number of nights" className="@xl:col-span-2">
              <Input
                value={builder.packageTitle}
                onChange={(e) => builder.set("packageTitle", e.target.value)}
                placeholder={defaultTitle || "Umrah Package"}
              />
            </Field>
            <div className="@xl:col-span-2">
              <IssueList issues={issues} prefix="guest" />
            </div>
          </div>
        </Card>

        {/* ---------------- hotels ---------------- */}
        <Card>
          <CardHeader title="Hotels" subtitle="In the order the guests stay - nights come from the dates" />
          <div className="space-y-3 p-5">
            {builder.stays.map((stay, index) => (
              <StayRow
                key={stay.key}
                stay={stay}
                index={index}
                nights={pricing.stays[index]?.nights}
                invalid={issues.some((e) => e.severity === "error" && e.path.startsWith(`stays.${index}.`))}
                removable={builder.stays.length > 1}
              />
            ))}
            <div className="flex flex-wrap items-center gap-3">
              <Button variant="soft" size="sm" icon={<Plus className="size-4" />} onClick={builder.addStay}>
                Add hotel
              </Button>
              <span className="ml-auto text-sm text-muted">
                {pricing.totalNights} nights
                {pricing.totalNights > 0 && ` · ${pricing.totalNights + 1} days`}
              </span>
            </div>
            <IssueList issues={issues} prefix="stays" />
          </div>
        </Card>

        <TransportSection />
        <IssueList issues={issues} prefix="transportLegs" />

        <FlightSection />
        <IssueList issues={issues} prefix="flight" />

        <ChargesSection />
        <IssueList issues={issues} prefix="charges" />

        <PricingSection pricing={pricing} />
        <IssueList issues={issues} prefix="currency" />
        <IssueList issues={issues} prefix="tiers" />

        {/* ---------------- notes ---------------- */}
        <Card>
          <CardHeader title="Includes, requirements & terms" subtitle="One line each. Printed on page two" />
          <div className="grid gap-4 p-5 @2xl:grid-cols-3">
            <Field label="Price includes">
              <Textarea
                rows={6}
                value={builder.includesText}
                onChange={(e) => builder.set("includesText", e.target.value)}
                placeholder={"Hotel accommodation\nTransport as listed"}
              />
            </Field>
            <Field label="Visa requirements">
              <Textarea
                rows={6}
                value={builder.requirementsText}
                onChange={(e) => builder.set("requirementsText", e.target.value)}
                placeholder={"Passport valid for 6 months"}
              />
            </Field>
            <Field label="Terms & taxes">
              <Textarea
                rows={6}
                value={builder.termsText}
                onChange={(e) => builder.set("termsText", e.target.value)}
                placeholder={"All above rates are subject to availability."}
              />
            </Field>
            <Field label="Remarks (printed on the quotation)" className="@2xl:col-span-3">
              <Textarea value={builder.remarks} onChange={(e) => builder.set("remarks", e.target.value)} />
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

      <div className="hidden xl:block">
        <div className="sticky top-5">
          <PdfPreviewFrame
            endpoint="/api/umrah-quotations/preview-pdf"
            body={previewBody}
            canPreview={errors.length === 0 && builder.stays.length > 0}
            emptyHint="Fix any problems on the form to see the preview."
          />
        </div>
      </div>
    </div>
  );
}
