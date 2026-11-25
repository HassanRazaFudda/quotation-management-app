"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowDownAZ, ArrowUpAZ, Filter, Search } from "lucide-react";

import { cn } from "@/lib/cn";

const BLANK_LABEL = "(Blanks)";

/**
 * An Excel-style filter on one column header: sort A to Z / Z to A, search the
 * column's values, tick any number of them (Select all, Blanks included), then
 * OK. Nothing applies until OK, as in Excel.
 *
 * `selected` is null when the column is not filtered (every value shown).
 */
export function ColumnFilter({
  header,
  values,
  selected,
  sort,
  onApply,
  onSort,
}: {
  header: string;
  /** Every value the column can show here; "" stands for blanks. */
  values: string[];
  selected: string[] | null;
  sort: "asc" | "desc" | null;
  onApply: (selected: string[] | null) => void;
  onSort: (direction: "asc" | "desc") => void;
}) {
  const button = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [place, setPlace] = useState({ top: 0, left: 0 });
  const [query, setQuery] = useState("");
  const [ticked, setTicked] = useState<Set<string>>(new Set());

  const filtered = selected !== null;

  /** Sit just under the header button, kept on screen. */
  function placeUnderButton() {
    const rect = button.current?.getBoundingClientRect();
    if (!rect) return;
    const width = 272;
    setPlace({ top: rect.bottom + 4, left: Math.max(8, Math.min(rect.left, window.innerWidth - width - 8)) });
  }

  function openPanel() {
    placeUnderButton();
    setTicked(new Set(selected ?? values));
    setQuery("");
    setOpen(true);
  }

  // Close on a click outside or Escape; follow the header when the page or table scrolls.
  useEffect(() => {
    if (!open) return;
    const outside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!panel.current?.contains(target) && !button.current?.contains(target)) setOpen(false);
    };
    const key = (event: KeyboardEvent) => event.key === "Escape" && setOpen(false);
    const scroll = (event: Event) => {
      if (!panel.current?.contains(event.target as Node)) placeUnderButton();
    };
    document.addEventListener("mousedown", outside);
    document.addEventListener("keydown", key);
    window.addEventListener("scroll", scroll, true);
    return () => {
      document.removeEventListener("mousedown", outside);
      document.removeEventListener("keydown", key);
      window.removeEventListener("scroll", scroll, true);
    };
  }, [open]);

  const label = (value: string) => (value === "" ? BLANK_LABEL : value);
  const visible = values.filter((value) => label(value).toLowerCase().includes(query.trim().toLowerCase()));
  const allVisibleTicked = visible.length > 0 && visible.every((value) => ticked.has(value));

  function toggleAllVisible() {
    setTicked((current) => {
      const next = new Set(current);
      for (const value of visible) {
        if (allVisibleTicked) next.delete(value);
        else next.add(value);
      }
      return next;
    });
  }

  function toggle(value: string) {
    setTicked((current) => {
      const next = new Set(current);
      if (next.has(value)) next.delete(value);
      else next.add(value);
      return next;
    });
  }

  function apply() {
    // Every value ticked is the same as no filter at all.
    const kept = values.filter((value) => ticked.has(value));
    onApply(kept.length === values.length ? null : kept);
    setOpen(false);
  }

  return (
    <>
      <button
        ref={button}
        type="button"
        onClick={() => (open ? setOpen(false) : openPanel())}
        aria-label={`Filter ${header}`}
        title={filtered ? `${header}: filtered` : `Filter ${header}`}
        className={cn(
          "ml-1 inline-flex size-6 items-center justify-center rounded border align-middle transition-colors",
          filtered || sort
            ? "border-brand-500 bg-brand-500 text-white"
            : "border-line bg-white text-gray-400 hover:border-gray-300 hover:text-ink",
        )}
      >
        <Filter className="size-3.5" />
      </button>

      {open && (
        <div
          ref={panel}
          style={{ top: place.top, left: place.left }}
          className="fixed z-50 w-[17rem] rounded-lg border border-line bg-white p-2 text-sm font-normal normal-case tracking-normal text-ink shadow-xl"
        >
          <button
            type="button"
            onClick={() => {
              onSort("asc");
              setOpen(false);
            }}
            className={cn("flex w-full items-center gap-2 rounded px-2 py-1.5 hover:bg-canvas", sort === "asc" && "font-semibold")}
          >
            <ArrowDownAZ className="size-4 text-muted" /> Sort A to Z
          </button>
          <button
            type="button"
            onClick={() => {
              onSort("desc");
              setOpen(false);
            }}
            className={cn("flex w-full items-center gap-2 rounded px-2 py-1.5 hover:bg-canvas", sort === "desc" && "font-semibold")}
          >
            <ArrowUpAZ className="size-4 text-muted" /> Sort Z to A
          </button>
          <button
            type="button"
            disabled={!filtered}
            onClick={() => {
              onApply(null);
              setOpen(false);
            }}
            className="mt-0.5 w-full rounded px-2 py-1.5 text-left hover:bg-canvas disabled:cursor-default disabled:text-gray-300 disabled:hover:bg-transparent"
          >
            Clear filter from “{header}”
          </button>

          <div className="relative my-2">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-gray-400" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search"
              className="h-8 w-full rounded-md border border-line pl-8 pr-2 text-sm"
            />
          </div>

          <div className="max-h-64 overflow-y-auto rounded-md border border-line py-1">
            <label className="flex cursor-pointer items-center gap-2 px-2 py-1 hover:bg-canvas">
              <input type="checkbox" checked={allVisibleTicked} onChange={toggleAllVisible} className="size-4 accent-brand-500" />
              <span className="font-medium">{query.trim() ? "(Select all search results)" : "(Select all)"}</span>
            </label>
            {visible.map((value) => (
              <label key={value || "__blank"} className="flex cursor-pointer items-center gap-2 px-2 py-1 hover:bg-canvas">
                <input
                  type="checkbox"
                  checked={ticked.has(value)}
                  onChange={() => toggle(value)}
                  className="size-4 accent-brand-500"
                />
                <span className={cn("truncate", value === "" && "text-muted")}>{label(value)}</span>
              </label>
            ))}
            {visible.length === 0 && <p className="px-2 py-1 text-muted">No matches</p>}
          </div>

          <div className="mt-2 flex items-center justify-between gap-2">
            <span className="text-xs text-muted">
              {ticked.size} of {values.length} selected
            </span>
            <div className="flex gap-1.5">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-md border border-line px-3 py-1 text-sm hover:bg-canvas"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={apply}
                disabled={ticked.size === 0}
                className="rounded-md bg-brand-500 px-3 py-1 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-50"
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
