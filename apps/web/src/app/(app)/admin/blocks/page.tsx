"use client";

import {
  BLOCK_PHASES,
  HIJRI_MONTHS,
  type BlockPhase,
  type HijriDate,
  type HijriMonth,
  type ResolvedBlock,
} from "@junaidi/shared";
import { useEffect, useState } from "react";
import { CalendarDays, CheckCircle2, Plus, Save, Trash2, Upload } from "lucide-react";

import { PageHeader } from "@/components/app-shell";
import { toast } from "@/components/toast";
import {
  Badge,
  Button,
  Card,
  Field,
  Input,
  NumberInput,
  Select,
  Spinner,
  Textarea,
} from "@/components/ui";
import { cn } from "@/lib/cn";
import { api, ApiError } from "@/lib/api";
import { useConfigStore } from "@/stores/config";

/**
 * Date blocks: the fixed Hijri stretches a Hajj package is sold in.
 *
 * Blocks are entered in Hijri because that is how they are negotiated. The
 * Gregorian dates and the night count are not typed in at all - they come from
 * the imported calendar, so a 29-day month is never quietly charged as 30.
 */
export default function BlocksPage() {
  const config = useConfigStore();
  const [showAdd, setShowAdd] = useState(false);

  useEffect(() => {
    config.load();
  }, [config]);

  if (!config.loaded) return <Spinner label="Loading…" />;

  const reload = () => config.load(undefined, true);

  return (
    <>
      <PageHeader
        title="Date Blocks & Calendar"
        subtitle={`Season ${config.season}`}
        action={
          <Button icon={<Plus className="size-4" />} onClick={() => setShowAdd((v) => !v)}>
            Add block
          </Button>
        }
      />
      <div className="grid gap-5 p-5 lg:grid-cols-[1fr_24rem] lg:p-8">
        <div className="space-y-4">
          {showAdd && (
            <AddBlock
              season={config.season}
              sortOrder={config.blocks.length}
              onDone={() => {
                setShowAdd(false);
                reload();
              }}
            />
          )}

          <div>
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">
              Blocks ({config.blocks.length})
            </h2>
            <Card className="divide-y divide-line">
              {config.blocks.map((block) => (
                <BlockRow key={block.id} block={block} onChanged={reload} />
              ))}
              {config.blocks.length === 0 && (
                <p className="px-5 py-4 text-sm text-muted">
                  No date blocks yet. Add the first one above.
                </p>
              )}
            </Card>
          </div>
        </div>

        <CalendarImport onImported={reload} />
      </div>
    </>
  );
}

// ------------------------------------------------------------------- rows

const PHASE_TONE: Record<BlockPhase, string> = {
  pre: "sent",
  hajj: "confirmed",
  post: "draft",
};

const PHASE_LABEL: Record<BlockPhase, string> = {
  pre: "Before Hajj",
  hajj: "Hajj days",
  post: "After Hajj",
};

/** One block, editable in place. */
function BlockRow({ block, onChanged }: { block: ResolvedBlock; onChanged: () => void }) {
  const config = useConfigStore();
  const [open, setOpen] = useState(false);
  const [start, setStart] = useState<HijriDate>(block.startHijri);
  const [end, setEnd] = useState<HijriDate>(block.endHijri);
  const [phase, setPhase] = useState<BlockPhase>(block.phase);
  const [locationIds, setLocationIds] = useState<string[]>(block.allowedLocationIds);
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    try {
      await api.post("/api/admin/blocks", {
        id: block.id,
        season: config.season,
        startHijri: start,
        endHijri: end,
        phase,
        allowedLocationIds: locationIds,
        sortOrder: block.sortOrder,
        active: true,
      });
      toast.success("Block saved");
      setOpen(false);
      onChanged();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Could not save.");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    try {
      await api.del(`/api/admin/blocks/${block.id}`);
      toast.success("Block removed");
      onChanged();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Could not remove.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="px-5 py-3">
      <div className="flex flex-wrap items-center gap-3">
        <button onClick={() => setOpen((v) => !v)} className="min-w-0 flex-1 text-left">
          <p className="font-medium text-ink">{block.label}</p>
          <p className="text-xs text-muted">
            {block.gregorianLabel ?? "no calendar imported"} · {block.nights} nights
            {!block.exact && block.gregorianLabel === null && " (estimated)"}
          </p>
        </button>

        <Badge tone={PHASE_TONE[block.phase]}>{PHASE_LABEL[block.phase]}</Badge>

        <div className="flex flex-wrap gap-1">
          {block.allowedLocationIds.map((id) => (
            <span key={id} className="rounded bg-canvas px-2 py-0.5 text-xs text-muted">
              {config.locations.find((l) => l.id === id)?.name ?? "?"}
            </span>
          ))}
        </div>

        <Button size="sm" variant="ghost" onClick={() => setOpen((v) => !v)}>
          {open ? "Close" : "Edit"}
        </Button>
      </div>

      {open && (
        <div className="mt-4 space-y-4 rounded-lg bg-canvas p-4">
          <BlockFields
            start={start}
            end={end}
            phase={phase}
            locationIds={locationIds}
            onStart={setStart}
            onEnd={setEnd}
            onPhase={setPhase}
            onLocations={setLocationIds}
          />
          <div className="flex items-center gap-2">
            <Button size="sm" icon={<Save className="size-4" />} loading={busy} onClick={save}>
              Save changes
            </Button>
            <Button
              size="sm"
              variant="danger"
              icon={<Trash2 className="size-4" />}
              loading={busy}
              onClick={remove}
              className="ml-auto"
            >
              Remove block
            </Button>
          </div>
          <p className="text-xs text-muted">
            Removing hides the block from the builder. Quotations already made with it keep
            their dates.
          </p>
        </div>
      )}
    </div>
  );
}

function AddBlock({
  season,
  sortOrder,
  onDone,
}: {
  season: string;
  sortOrder: number;
  onDone: () => void;
}) {
  const [start, setStart] = useState<HijriDate>({ month: "Zilqad", day: 20 });
  const [end, setEnd] = useState<HijriDate>({ month: "Zilqad", day: 25 });
  const [phase, setPhase] = useState<BlockPhase>("pre");
  const [locationIds, setLocationIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      await api.post("/api/admin/blocks", {
        season,
        startHijri: start,
        endHijri: end,
        phase,
        allowedLocationIds: locationIds,
        sortOrder,
        active: true,
      });
      toast.success("Block added");
      onDone();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Could not add.");
      setSaving(false);
    }
  }

  return (
    <Card>
      <div className="border-b border-line px-5 py-3">
        <h2 className="font-semibold text-ink">New date block</h2>
      </div>
      <form onSubmit={submit} className="space-y-4 p-5">
        <BlockFields
          start={start}
          end={end}
          phase={phase}
          locationIds={locationIds}
          onStart={setStart}
          onEnd={setEnd}
          onPhase={setPhase}
          onLocations={setLocationIds}
        />
        <Button type="submit" loading={saving} disabled={locationIds.length === 0}>
          Add block
        </Button>
      </form>
    </Card>
  );
}

/** The fields of a block, shared by the add form and the inline editor. */
function BlockFields({
  start,
  end,
  phase,
  locationIds,
  onStart,
  onEnd,
  onPhase,
  onLocations,
}: {
  start: HijriDate;
  end: HijriDate;
  phase: BlockPhase;
  locationIds: string[];
  onStart: (value: HijriDate) => void;
  onEnd: (value: HijriDate) => void;
  onPhase: (value: BlockPhase) => void;
  onLocations: (value: string[]) => void;
}) {
  const config = useConfigStore();

  const toggle = (id: string) =>
    onLocations(
      locationIds.includes(id) ? locationIds.filter((x) => x !== id) : [...locationIds, id],
    );

  return (
    <>
      <div className="flex flex-wrap items-end gap-3">
        <HijriField label="From" value={start} onChange={onStart} />
        <span className="pb-2.5 text-muted">→</span>
        <HijriField label="To" value={end} onChange={onEnd} />

        <Field label="Phase" className="w-40">
          <Select
            options={BLOCK_PHASES.map((value) => ({ value, label: PHASE_LABEL[value] }))}
            value={phase}
            onChange={(e) => onPhase(e.target.value as BlockPhase)}
          />
        </Field>
      </div>

      <div>
        <span className="mb-1.5 block text-sm text-muted">
          Where the guest can stay in this block
        </span>
        <div className="flex flex-wrap gap-1.5">
          {config.locations.map((location) => {
            const on = locationIds.includes(location.id);
            return (
              <button
                key={location.id}
                type="button"
                onClick={() => toggle(location.id)}
                className={cn(
                  "rounded-lg border px-3 py-1.5 text-sm transition-colors",
                  on
                    ? "border-brand-200 bg-brand-50 text-brand-700"
                    : "border-line bg-white text-muted hover:border-gray-300",
                )}
              >
                {location.name}
              </button>
            );
          })}
        </div>
        {locationIds.length === 0 && (
          <p className="mt-1 text-xs text-brand-600">
            Pick at least one — a block with nowhere to stay cannot be quoted.
          </p>
        )}
      </div>
    </>
  );
}

function HijriField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: HijriDate;
  onChange: (value: HijriDate) => void;
}) {
  return (
    <Field label={label}>
      <div className="flex gap-2">
        <NumberInput
          min={1}
          max={30}
          fallback={1}
          value={value.day}
          onChange={(day) => onChange({ ...value, day })}
          className="w-20"
        />
        <Select
          options={HIJRI_MONTHS.map((month) => ({ value: month, label: month }))}
          value={value.month}
          onChange={(e) => onChange({ ...value, month: e.target.value as HijriMonth })}
          className="w-36"
        />
      </div>
    </Field>
  );
}

// -------------------------------------------------------------- calendar

/**
 * Calendar import. The admin pastes one month per line as
 * "Month, YYYY-MM-DD (day 1), length", checks it (a dry run reports any
 * non-contiguous months), then imports.
 */
function CalendarImport({ onImported }: { onImported: () => void }) {
  const config = useConfigStore();
  const [year, setYear] = useState(config.season);
  const [text, setText] = useState(SAMPLE);
  const [problems, setProblems] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);

  function parse(): { hijriYear: number; month: string; startGregorian: string; length: number }[] {
    return text
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const [month, start, length] = line.split(",").map((p) => p.trim());
        return {
          hijriYear: Number(year),
          month: month ?? "",
          startGregorian: start ?? "",
          length: Number(length),
        };
      });
  }

  async function check() {
    setBusy(true);
    try {
      const months = parse();
      const bad = months.find((m) => !HIJRI_MONTHS.includes(m.month as never));
      if (bad) throw new ApiError(`"${bad.month}" is not a Hijri month name.`, 400);
      const res = await api.post<{ problems: string[] }>("/api/admin/calendar/import", {
        months,
        dryRun: true,
      });
      setProblems(res.problems);
      if (res.problems.length === 0) toast.success("Looks good — ready to import.");
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Check failed.");
    } finally {
      setBusy(false);
    }
  }

  async function doImport() {
    setBusy(true);
    try {
      const res = await api.post<{ days: number }>("/api/admin/calendar/import", {
        months: parse(),
        replaceYear: Number(year),
      });
      toast.success(`Imported ${res.days} days.`);
      onImported();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Import failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <div className="flex items-center gap-2 border-b border-line px-5 py-3">
        <CalendarDays className="size-4 text-brand-500" />
        <h2 className="font-semibold text-ink">Import Calendar</h2>
      </div>
      <div className="space-y-3 p-5">
        <Field label="Hijri year">
          <Input value={year} onChange={(e) => setYear(e.target.value)} className="w-32" />
        </Field>
        <Field label="Months" hint="One per line: Month, first Gregorian date, length (29 or 30)">
          <Textarea value={text} onChange={(e) => setText(e.target.value)} className="min-h-40 font-mono text-xs" />
        </Field>

        {problems && (
          <div className="space-y-1">
            {problems.length === 0 ? (
              <p className="flex items-center gap-2 text-sm text-ok">
                <CheckCircle2 className="size-4" /> Contiguous — safe to import.
              </p>
            ) : (
              problems.map((p, i) => (
                <p key={i} className="rounded bg-amber-50 px-2 py-1 text-xs text-amber-800">{p}</p>
              ))
            )}
          </div>
        )}

        <div className="flex gap-2">
          <Button variant="secondary" onClick={check} loading={busy}>
            Check
          </Button>
          <Button icon={<Upload className="size-4" />} onClick={doImport} loading={busy}>
            Import
          </Button>
        </div>
      </div>
    </Card>
  );
}

const SAMPLE = `Ramadan, 2027-02-08, 30
Shawwal, 2027-03-10, 29
Zilqad, 2027-04-08, 29
Zilhaj, 2027-05-07, 30`;
