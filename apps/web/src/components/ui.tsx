/**
 * Small, styled primitives shared across the app. Kept in one file so the
 * common look (radius, focus ring, brand red) stays consistent without pulling
 * in a component library.
 */

"use client";

import { forwardRef, useEffect, useState, type ReactNode } from "react";
import { Loader2 } from "lucide-react";

import { cn } from "@/lib/cn";

// ------------------------------------------------------------------ Button

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "soft";
type ButtonSize = "sm" | "md" | "lg";

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary: "bg-brand-500 text-white hover:bg-brand-600 shadow-sm",
  secondary: "bg-white text-ink border border-line hover:bg-canvas",
  ghost: "text-muted hover:bg-canvas",
  danger: "bg-white text-brand-600 border border-brand-200 hover:bg-brand-50",
  soft: "bg-brand-50 text-brand-600 border border-brand-200 hover:bg-brand-100",
};

const BUTTON_SIZES: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-sm",
  md: "h-10 px-4 text-sm",
  lg: "h-11 px-6 text-base",
};

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  icon?: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "primary", size = "md", loading, icon, className, children, disabled, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors",
        "disabled:cursor-not-allowed disabled:opacity-50",
        BUTTON_VARIANTS[variant],
        BUTTON_SIZES[size],
        className,
      )}
      {...props}
    >
      {loading ? <Loader2 className="size-4 animate-spin" /> : icon}
      {children}
    </button>
  );
});

// ------------------------------------------------------------------- Input

interface FieldProps {
  label?: string;
  hint?: string;
  error?: string;
  className?: string;
  children: ReactNode;
}

export function Field({ label, hint, error, className, children }: FieldProps) {
  return (
    <label className={cn("block", className)}>
      {label && <span className="mb-1.5 block text-sm text-muted">{label}</span>}
      {children}
      {error ? (
        <span className="mt-1 block text-xs text-brand-600">{error}</span>
      ) : hint ? (
        <span className="mt-1 block text-xs text-muted">{hint}</span>
      ) : null}
    </label>
  );
}

export const inputClass =
  "h-10 w-full rounded-lg border border-line bg-white px-3 text-sm text-ink " +
  "placeholder:text-gray-400 transition-colors focus:border-brand-300";

export const Input = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...props }, ref) {
    return <input ref={ref} className={cn(inputClass, className)} {...props} />;
  },
);

interface NumberInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "type" | "max"> {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  /** Typing past this is clamped, not just discouraged by the spinner. */
  max?: number;
  /** Used when the field is left empty. */
  fallback?: number;
}

/**
 * A number field that can be emptied.
 *
 * Coercing on every keystroke (`Number(e.target.value) || 1`) makes a cleared
 * field snap back to its fallback, so typing "4" over it produces "14". This
 * keeps the raw text while the user edits and only settles the value when they
 * leave the field.
 */
export const NumberInput = forwardRef<HTMLInputElement, NumberInputProps>(function NumberInput(
  { value, onChange, min = 0, max, fallback, className, onBlur, ...props },
  ref,
) {
  const settled = fallback ?? min;
  const clamp = (n: number) => Math.min(max ?? Infinity, Math.max(min, n));
  const [draft, setDraft] = useState(String(value));

  // Follow changes that came from elsewhere, but never interrupt typing.
  useEffect(() => {
    setDraft((current) => (Number(current) === value ? current : String(value)));
  }, [value]);

  return (
    <input
      ref={ref}
      type="number"
      inputMode="numeric"
      min={min}
      max={max}
      value={draft}
      className={cn(inputClass, className)}
      onChange={(event) => {
        const next = event.target.value;
        setDraft(next); // an empty field is allowed while editing
        if (next === "") return;
        const parsed = Number(next);
        if (Number.isFinite(parsed)) onChange(clamp(parsed));
      }}
      onBlur={(event) => {
        if (draft === "" || !Number.isFinite(Number(draft))) {
          setDraft(String(settled));
          onChange(settled);
        } else {
          // Show what was actually kept, not what was typed over the limit.
          setDraft(String(clamp(Number(draft))));
        }
        onBlur?.(event);
      }}
      {...props}
    />
  );
});

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(function Textarea({ className, ...props }, ref) {
  return (
    <textarea
      ref={ref}
      className={cn(inputClass, "h-auto min-h-24 resize-y py-2 leading-relaxed", className)}
      {...props}
    />
  );
});

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  options: Array<{ value: string; label: string }>;
  placeholder?: string;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { options, placeholder, className, value, ...props },
  ref,
) {
  // Once something is chosen the placeholder is noise — and leaving it in the
  // list means an unknown value silently falls back to it.
  const showPlaceholder = placeholder && !value;

  return (
    <select
      ref={ref}
      value={value}
      className={cn(inputClass, "cursor-pointer pr-8", className)}
      {...props}
    >
      {showPlaceholder && <option value="">{placeholder}</option>}
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
});

// ------------------------------------------------------------ RadioGroup

interface RadioGroupProps<T extends string> {
  options: Array<{ value: T; label: string; hint?: string }>;
  value: T;
  onChange: (value: T) => void;
  className?: string;
}

/** A row of pill-style radios — used where the choice should be visible at a glance. */
export function RadioGroup<T extends string>({
  options,
  value,
  onChange,
  className,
}: RadioGroupProps<T>) {
  return (
    <div className={cn("flex flex-wrap gap-2", className)}>
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            aria-pressed={selected}
            className={cn(
              "rounded-lg border px-4 py-2 text-sm font-medium transition-colors",
              selected
                ? "border-brand-500 bg-brand-500 text-white shadow-sm"
                : "border-line bg-white text-muted hover:border-gray-300 hover:text-ink",
            )}
          >
            {option.label}
            {option.hint && (
              <span className={cn("ml-1.5 text-xs", selected ? "text-brand-100" : "text-gray-400")}>
                {option.hint}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

// -------------------------------------------------------------------- Card

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div className={cn("rounded-card border border-line bg-white", className)}>{children}</div>
  );
}

export function CardHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
      <div className="flex items-center gap-3">
        <span className="h-5 w-1 rounded bg-brand-500" />
        <div>
          <h2 className="font-semibold text-ink">{title}</h2>
          {subtitle && <p className="text-xs text-muted">{subtitle}</p>}
        </div>
      </div>
      {action}
    </div>
  );
}

// ------------------------------------------------------------------- Badge

const BADGE_TONES: Record<string, string> = {
  draft: "bg-gray-100 text-gray-600",
  sent: "bg-blue-50 text-blue-700",
  confirmed: "bg-emerald-50 text-emerald-700",
  expired: "bg-amber-50 text-amber-700",
  admin: "bg-brand-50 text-brand-600",
  staff: "bg-gray-100 text-gray-600",
};

export function Badge({ children, tone = "draft" }: { children: ReactNode; tone?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium capitalize",
        BADGE_TONES[tone] ?? BADGE_TONES.draft,
      )}
    >
      {children}
    </span>
  );
}

// ----------------------------------------------------------------- Spinner

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-10 text-muted">
      <Loader2 className="size-5 animate-spin" />
      {label && <span className="text-sm">{label}</span>}
    </div>
  );
}

// ------------------------------------------------------------------- Modal

/**
 * A small centred dialog over a dimmed backdrop. Clicking the backdrop or
 * pressing Escape closes it; the panel itself swallows clicks.
 */
export function Modal({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-card border border-line bg-white shadow-lg"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="border-b border-line px-5 py-4">
          <h2 className="font-semibold text-ink">{title}</h2>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------- Empty

export function EmptyState({ icon, title, hint, action }: { icon?: ReactNode; title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-card border border-dashed border-line bg-white/50 px-6 py-14 text-center">
      {icon && <div className="text-gray-300">{icon}</div>}
      <p className="font-medium text-ink">{title}</p>
      {hint && <p className="max-w-sm text-sm text-muted">{hint}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
