/**
 * PDF rendering via a long-lived headless Chromium.
 *
 * Deliberately NOT serverless-shaped: the browser is launched once and reused,
 * and only a page is created per request. On a persistent host that makes a
 * render ~1-2s instead of paying a browser launch every time.
 *
 * Concurrency is capped because Chromium is the memory hog in any container we
 * are likely to run on; two simultaneous renders is plenty for a handful of
 * staff and keeps us well inside 512 MB.
 */

import puppeteer, { type Browser, type Page } from "puppeteer";

import { buildHtml } from "./template";
import type { QuotationPdfView } from "./view";

/**
 * Zoom levels tried in order until nothing overflows its page.
 *
 * 0.7 is the floor on purpose: below it the 10pt body text drops under ~7pt
 * and the customer cannot comfortably read it. In practice this holds a
 * comfortably long itinerary; a real package runs to 5-8 stays. Past the
 * bottom of the ladder the page is printed anyway, clipped, rather than
 * shrunk into illegibility.
 */
export const FIT_SCALES = [1, 0.96, 0.92, 0.88, 0.84, 0.8, 0.75, 0.7] as const;

/**
 * Zero: the template draws its own 210x297mm page boxes, complete with
 * padding and a per-page footer. Letting Chromium add margins on top would
 * shift every sheet and break the footer's position.
 */
const PAGE_MARGIN = { top: "0", bottom: "0", left: "0", right: "0" } as const;

export interface RenderOptions {
  /** Shrink until nothing overflows. Off prints at full size whatever happens. */
  autoFit?: boolean;
  /** Guard against a wedged page; the whole render is abandoned after this. */
  timeoutMs?: number;
}

let browserPromise: Promise<Browser> | null = null;

async function launch(): Promise<Browser> {
  return puppeteer.launch({
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      // Containers give /dev/shm only 64 MB; without this Chromium crashes.
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--disable-extensions",
    ],
  });
}

/** The shared browser, launched on first use and re-launched if it dies. */
export async function getBrowser(): Promise<Browser> {
  if (browserPromise) {
    try {
      const existing = await browserPromise;
      if (existing.connected) return existing;
    } catch {
      // fall through and relaunch
    }
  }
  browserPromise = launch();
  return browserPromise;
}

export async function closeBrowser(): Promise<void> {
  if (!browserPromise) return;
  const current = browserPromise;
  browserPromise = null;
  try {
    const browser = await current;
    await browser.close();
  } catch {
    // already gone
  }
}

// ------------------------------------------------------------- concurrency

const MAX_CONCURRENT = 2;
let active = 0;
const waiting: Array<() => void> = [];

async function acquire(): Promise<void> {
  if (active < MAX_CONCURRENT) {
    active += 1;
    return;
  }
  await new Promise<void>((resolve) => waiting.push(resolve));
  active += 1;
}

function release(): void {
  active -= 1;
  waiting.shift()?.();
}

// ----------------------------------------------------------------- pages

/**
 * Count pages by scanning the PDF for page objects. Cheap, dependency-free,
 * and good enough to decide whether the auto-fit needs another turn.
 */
export function pdfPageCount(pdf: Uint8Array): number {
  const text = Buffer.from(pdf).toString("latin1");
  return (text.match(/\/Type\s*\/Page[^s]/g) ?? []).length;
}

// ----------------------------------------------------------------- render

/**
 * Does any section run past the bottom of the page it is on?
 *
 * Measured in the DOM rather than by counting PDF pages, because the sheets
 * are a fixed height and clip their overflow - a page that is too full still
 * prints as one page, it just loses the bottom of it. The direct children of
 * `.sheet-body` are set not to shrink, so a section that does not fit really
 * does stick out and can be seen here.
 */
async function overflows(page: Page): Promise<boolean> {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll(".sheet-body")).some((body) => {
      const limit = body.getBoundingClientRect().bottom;
      return Array.from(body.children).some(
        (child) => child.getBoundingClientRect().bottom > limit + 1,
      );
    }),
  );
}

export async function renderQuotation(
  view: QuotationPdfView,
  options: RenderOptions = {},
): Promise<Uint8Array> {
  const { autoFit = true, timeoutMs = 60_000 } = options;

  await acquire();
  const browser = await getBrowser();
  const page = await browser.newPage();

  try {
    page.setDefaultTimeout(timeoutMs);
    const scales = autoFit ? FIT_SCALES : ([1] as const);

    for (let index = 0; index < scales.length; index += 1) {
      // The template embeds its logo as a data URI and loads nothing else, so
      // "load" is enough - "networkidle0" would only add latency.
      await page.setContent(buildHtml(view, scales[index]!), { waitUntil: "load" });

      // The last rung is printed whatever it looks like: a slightly clipped
      // page beats no quotation at all.
      if (index === scales.length - 1) break;
      if (!(await overflows(page))) break;
    }

    return await page.pdf({
      format: "A4",
      printBackground: true,
      margin: PAGE_MARGIN,
    });
  } finally {
    await page.close().catch(() => undefined);
    release();
  }
}

/**
 * Render a trivial document to prove Chromium works in this environment.
 * Call it on boot so a broken deploy fails loudly instead of at the first
 * customer quotation.
 */
export async function healthCheck(): Promise<{ ok: boolean; detail: string }> {
  try {
    const browser = await getBrowser();
    const page = await browser.newPage();
    try {
      await page.setContent("<h1>ok</h1>", { waitUntil: "load" });
      const pdf = await page.pdf({ format: "A4" });
      return pdf.length > 0
        ? { ok: true, detail: `Chromium ready (${pdf.length} bytes)` }
        : { ok: false, detail: "Chromium produced an empty PDF" };
    } finally {
      await page.close().catch(() => undefined);
    }
  } catch (error) {
    return { ok: false, detail: error instanceof Error ? error.message : String(error) };
  }
}
