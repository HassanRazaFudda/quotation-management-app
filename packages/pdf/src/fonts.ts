/**
 * The brand font, embedded in the page as a data URI.
 *
 * Only the company name in the letterhead uses a brand face (Nexa); the rest of
 * the document stays on the system sans-serif. Embedding it, like the logo,
 * means the page makes no network request - on a Linux server the header would
 * otherwise fall back to Liberation Sans instead of the brand face.
 *
 * Read once, synchronously, when this module is first imported. It is a small
 * static asset that ships with the package, and doing it here keeps `buildHtml`
 * synchronous.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const assets = join(dirname(fileURLToPath(import.meta.url)), "..", "assets");

/** A missing font must not stop a quotation going out - fall back silently. */
function dataUri(file: string, mime: string): string {
  try {
    return `data:${mime};base64,${readFileSync(join(assets, file)).toString("base64")}`;
  } catch {
    return "";
  }
}

/** Nexa Bold: the company name in the letterhead. Licensed by the client. */
const nexaBold = dataUri("nexa-bold.woff", "font/woff");

const face = (
  family: string,
  uri: string,
  format: string,
  weight: string,
): string =>
  uri
    ? `        @font-face {
            font-family: '${family}';
            src: url(${uri}) format('${format}');
            font-weight: ${weight};
            font-style: normal;
            font-display: block;
        }`
    : "";

/** The `@font-face` rule to drop at the top of the document's stylesheet. */
export const FONT_FACE_CSS = [face("Nexa", nexaBold, "woff", "700")]
  .filter(Boolean)
  .join("\n");
