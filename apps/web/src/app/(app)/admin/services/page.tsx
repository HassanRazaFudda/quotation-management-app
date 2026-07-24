"use client";

import { useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";

import { PageHeader } from "@/components/app-shell";
import { toast } from "@/components/toast";
import { Button, Card, Input, Spinner } from "@/components/ui";
import { cn } from "@/lib/cn";
import { api, ApiError } from "@/lib/api";
import { servicesByCategory, useConfigStore } from "@/stores/config";

const CATEGORIES: Array<{ key: string; title: string; hint: string }> = [
  { key: "minaServices", title: "Extra Services in Mina", hint: "Shown in the Mina services box" },
  { key: "arafatServices", title: "Extra Services in Arafat", hint: "Shown in the Arafat services box" },
  { key: "includes", title: "Price Includes", hint: "Left footer box" },
  { key: "requirements", title: "Visa Requirements", hint: "Middle footer box" },
  { key: "terms", title: "Terms & Taxes", hint: "Right footer box" },
];

export default function ServicesPage() {
  const config = useConfigStore();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    config.load();
  }, [config]);

  async function add(category: string, label: string) {
    if (!label.trim()) return;
    setBusy(true);
    try {
      await api.post("/api/admin/services", { category, label: label.trim(), defaultSelected: true });
      await config.load(undefined, true);
      toast.success("Added");
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Could not add.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    setBusy(true);
    try {
      await api.del(`/api/admin/services/${id}`);
      await config.load(undefined, true);
      toast.success("Removed");
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Could not remove.");
    } finally {
      setBusy(false);
    }
  }

  /** Set a line's colour or weight. Saved immediately, then config reloads. */
  async function styleService(id: string, patch: { color?: string; bold?: boolean }) {
    try {
      await api.patch(`/api/admin/services/${id}`, patch);
      await config.load(undefined, true);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Could not save.");
    }
  }

  async function addCategory(label: string) {
    if (!label.trim()) return;
    setBusy(true);
    try {
      await api.post("/api/admin/package-categories", { label: label.trim() });
      await config.load(undefined, true);
      toast.success("Added");
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Could not add.");
    } finally {
      setBusy(false);
    }
  }

  async function removeCategory(id: string) {
    setBusy(true);
    try {
      await api.del(`/api/admin/package-categories/${id}`);
      await config.load(undefined, true);
      toast.success("Removed");
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Could not remove.");
    } finally {
      setBusy(false);
    }
  }

  if (!config.loaded) return <Spinner label="Loading…" />;

  return (
    <>
      <PageHeader title="Services & Lists" subtitle="Package categories and the bullet lists on a quotation" />
      <div className="grid gap-5 p-5 lg:grid-cols-2 lg:p-8">
        <ServiceGroup
          title="Maktab Categories"
          hint="Package-level labels staff pick from (shown on the quotation)"
          items={config.packageCategories}
          busy={busy}
          onAdd={addCategory}
          onRemove={removeCategory}
        />
        {CATEGORIES.map((cat) => (
          <ServiceGroup
            key={cat.key}
            title={cat.title}
            hint={cat.hint}
            items={servicesByCategory(config, cat.key)}
            busy={busy}
            onAdd={(label) => add(cat.key, label)}
            onRemove={remove}
            onStyle={styleService}
          />
        ))}
      </div>
    </>
  );
}

interface StyledItem {
  id: string;
  label: string;
  color?: string;
  bold?: boolean;
}

function ServiceGroup({
  title,
  hint,
  items,
  busy,
  onAdd,
  onRemove,
  onStyle,
}: {
  title: string;
  hint: string;
  items: StyledItem[];
  busy: boolean;
  onAdd: (label: string) => void;
  onRemove: (id: string) => void;
  /** Present only for the styled lists; Maktab categories have no styling. */
  onStyle?: (id: string, patch: { color?: string; bold?: boolean }) => void;
}) {
  const [value, setValue] = useState("");

  function submit(e: React.FormEvent) {
    e.preventDefault();
    onAdd(value);
    setValue("");
  }

  return (
    <Card>
      <div className="border-b border-line px-5 py-3">
        <h2 className="font-semibold text-ink">{title}</h2>
        <p className="text-xs text-muted">{hint}</p>
      </div>
      <ul className="divide-y divide-line">
        {items.map((item) => {
          const color = /^#[0-9a-fA-F]{3,8}$/.test(item.color ?? "") ? item.color : "#111827";
          return (
            <li key={item.id} className="flex items-center justify-between gap-2 px-5 py-2.5">
              <span
                className="min-w-0 flex-1 truncate text-sm"
                style={{ color, fontWeight: item.bold ? 700 : 400 }}
              >
                {item.label}
              </span>
              {onStyle && (
                <>
                  {/* Colour picker; a swatch that opens the native colour dialog. */}
                  <label
                    className="relative size-6 shrink-0 cursor-pointer rounded border border-line"
                    style={{ backgroundColor: color }}
                    title="Line colour"
                  >
                    <input
                      type="color"
                      value={color}
                      onChange={(e) => onStyle(item.id, { color: e.target.value })}
                      className="absolute inset-0 cursor-pointer opacity-0"
                    />
                  </label>
                  <button
                    onClick={() => onStyle(item.id, { color: "" })}
                    disabled={busy}
                    className="shrink-0 rounded px-1.5 py-1 text-xs text-muted hover:text-ink"
                    title="Reset to black"
                  >
                    reset
                  </button>
                  <button
                    onClick={() => onStyle(item.id, { bold: !item.bold })}
                    disabled={busy}
                    className={cn(
                      "shrink-0 rounded border px-2 py-1 text-xs font-bold transition-colors",
                      item.bold
                        ? "border-brand-200 bg-brand-50 text-brand-700"
                        : "border-line text-muted hover:text-ink",
                    )}
                    title="Bold"
                  >
                    B
                  </button>
                </>
              )}
              <button
                onClick={() => onRemove(item.id)}
                disabled={busy}
                className="shrink-0 rounded-lg p-1.5 text-gray-400 hover:bg-brand-50 hover:text-brand-600"
              >
                <Trash2 className="size-4" />
              </button>
            </li>
          );
        })}
        {items.length === 0 && <li className="px-5 py-3 text-sm text-muted">Nothing yet.</li>}
      </ul>
      <form onSubmit={submit} className="flex gap-2 border-t border-line p-3">
        <Input value={value} onChange={(e) => setValue(e.target.value)} placeholder="Add an item…" />
        <Button type="submit" size="sm" icon={<Plus className="size-4" />} loading={busy} disabled={!value.trim()}>
          Add
        </Button>
      </form>
    </Card>
  );
}
