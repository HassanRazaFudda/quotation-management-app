/**
 * These drive a real Chromium, so they are slower than the rest of the suite.
 * They exist because every PDF problem this project has had showed up only in
 * a real render - never in a string assertion.
 */

import { afterAll, describe, expect, it } from "vitest";

import { loadLogoDataUri } from "../logo";
import { closeBrowser, healthCheck, pdfPageCount, renderQuotation } from "../renderer";
import { buildPdfView } from "../view";
import { sampleInput, sampleView } from "./fixture";

afterAll(async () => {
  await closeBrowser();
});

describe("Chromium", () => {
  it("is available and can print", async () => {
    const result = await healthCheck();
    expect(result.ok, result.detail).toBe(true);
  }, 60_000);
});

describe("rendering a quotation", () => {
  /**
   * Two pages, always: itinerary and price on the first, the terms and the
   * signatures on the second. A third page would mean the sheets are no longer
   * the size of the paper.
   */
  it("produces exactly two pages", async () => {
    const pdf = await renderQuotation(sampleView);
    expect(pdf.length).toBeGreaterThan(1000);
    expect(pdfPageCount(pdf)).toBe(2);
  }, 90_000);

  it("embeds the logo, so the file is substantial", async () => {
    const view = buildPdfView({
      ...sampleInput,
      logoDataUri: await loadLogoDataUri(),
    });
    const pdf = await renderQuotation(view);
    expect(view.logoDataUri.startsWith("data:image/png;base64,")).toBe(true);
    expect(pdf.length).toBeGreaterThan(50_000);
    expect(pdfPageCount(pdf)).toBe(2);
  }, 90_000);

  /**
   * A real Hajj package runs to 5-8 stays. Beyond that the auto-fit shrinks
   * the page rather than spilling onto a third sheet, down to the readability
   * floor of the zoom ladder.
   */
  const withStays = (count: number) => {
    const stays = [...sampleInput.stays];
    while (stays.length < count) {
      stays.push({
        phase: `Extra Stay ${stays.length}`,
        nights: "02 Nights",
        dates: "01 Zilhaj - 03 Zilhaj",
        datesSub: "16 May - 18 May 2026",
        accommodation: "Additional Hotel Option",
        meal: "Half Board",
        mealNote: "Buffet",
      });
    }
    return buildPdfView({ ...sampleInput, stays });
  };

  it("keeps a long itinerary on the same two pages", async () => {
    const pdf = await renderQuotation(withStays(10));
    expect(pdfPageCount(pdf)).toBe(2);
  }, 150_000);

  it("reuses the browser across renders", async () => {
    const first = await renderQuotation(sampleView);
    const started = Date.now();
    const second = await renderQuotation(sampleView);
    const warmMs = Date.now() - started;

    expect(pdfPageCount(first)).toBe(2);
    expect(pdfPageCount(second)).toBe(2);
    // A cold launch costs seconds; a warm render should be well under that.
    expect(warmMs).toBeLessThan(10_000);
  }, 120_000);

  it("handles concurrent requests without falling over", async () => {
    const pdfs = await Promise.all([
      renderQuotation(sampleView),
      renderQuotation(sampleView),
      renderQuotation(sampleView),
    ]);
    for (const pdf of pdfs) {
      expect(pdfPageCount(pdf)).toBe(2);
    }
  }, 120_000);
});
