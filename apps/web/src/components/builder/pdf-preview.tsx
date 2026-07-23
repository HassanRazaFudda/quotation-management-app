"use client";

import { FileText, Loader2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Card } from "@/components/ui";
import { API_BASE } from "@/lib/api";
import { toApiPayload, useBuilderStore } from "@/stores/builder";
import { useConfigStore } from "@/stores/config";
import { useAuthStore } from "@/stores/auth";

/**
 * Live PDF preview. Debounces a render of the current draft and shows the real
 * document in an iframe, so staff see the finished page as they build it.
 */
export function PdfPreview({ canPreview }: { canPreview: boolean }) {
  const builder = useBuilderStore();
  const season = useConfigStore((s) => s.season);
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lastUrl = useRef<string | null>(null);

  // A signature of everything that affects the document, so we only re-render
  // when something visible actually changed.
  const signature = JSON.stringify(toApiPayload(builder, season));

  useEffect(() => {
    if (!canPreview) {
      setError(null);
      return;
    }

    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        const token = useAuthStore.getState().token;
        const response = await fetch(`${API_BASE}/api/quotations/preview-pdf`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: signature,
          signal: controller.signal,
        });
        if (!response.ok) {
          const payload = await response.json().catch(() => null);
          throw new Error(payload?.error ?? "Preview failed.");
        }
        const blob = await response.blob();
        const objectUrl = URL.createObjectURL(blob);
        if (lastUrl.current) URL.revokeObjectURL(lastUrl.current);
        lastUrl.current = objectUrl;
        setUrl(objectUrl);
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setError(err instanceof Error ? err.message : "Preview failed.");
      } finally {
        setLoading(false);
      }
    }, 700); // debounce keystrokes

    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [signature, canPreview]);

  // Clean up the last object URL on unmount.
  useEffect(() => () => {
    if (lastUrl.current) URL.revokeObjectURL(lastUrl.current);
  }, []);

  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
        <div className="flex items-center gap-2 text-sm font-medium text-ink">
          <FileText className="size-4 text-brand-500" />
          Live Preview
        </div>
        {loading && <Loader2 className="size-4 animate-spin text-muted" />}
      </div>

      <div className="relative aspect-[210/297] bg-canvas">
        {url && canPreview ? (
          <iframe
            title="Quotation preview"
            src={`${url}#toolbar=0&navpanes=0&view=FitH`}
            className="h-full w-full"
          />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center text-sm text-muted">
            <FileText className="size-8 text-gray-300" />
            {error ? (
              <span className="text-brand-600">{error}</span>
            ) : canPreview ? (
              <span>Preparing preview…</span>
            ) : (
              <span>Add stays and fix any errors to see the preview.</span>
            )}
          </div>
        )}
      </div>
    </Card>
  );
}
